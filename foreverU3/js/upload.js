/* Member-only uploads. Supabase is a temporary inbox; GitHub is the durable archive. */
(() => {
  'use strict';
  const auth=window.ForeverAuth,client=auth?.client;
  const launch=document.createElement('button');launch.className='upload-launch';launch.textContent='＋ 上传照片';
  const dialog=document.createElement('dialog');dialog.className='upload-dialog';dialog.setAttribute('aria-labelledby','uploadTitle');
  dialog.innerHTML=`<header><h2 id="uploadTitle">把今天放进相册</h2><button type="button" data-close aria-label="关闭上传">✕</button></header>
    <p data-login>登录后就能上传照片。</p><button type="button" data-signin>登录</button>
    <form hidden><label>选择照片<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label>
    <label>拍摄日期（可不填）<input name="date" type="date"></label>
    <p>每次最多 10 张，每张不超过 12MB。JPEG 保留原文件；PNG / WebP 转为 JPEG。照片归档后会在公开相册中展示。</p>
    <button type="submit">上传到相册</button></form><p data-status role="status" aria-live="polite"></p><div class="upload-list" aria-label="最近上传"></div>`;
  document.body.append(launch,dialog);
  const q=s=>dialog.querySelector(s),form=q('form'),status=q('[data-status]'),list=q('.upload-list');
  let user=null,epoch=0,channel=null,busy=false,syncing=false,again=false;
  const retries=new Map();
  const signedCache=new Map();
  launch.onclick=()=>{dialog.showModal();sync();};q('[data-close]').onclick=()=>dialog.close();
  q('[data-signin]').onclick=()=>{dialog.close();auth.open(()=>launch.click());};
  const names={staging:'等待完成上传',queued:'已上传 · 等待归档',archived:'已归档 · 正在发布',published:'已上线 · 等待清理中转',cleaned:'已上线 · 中转已清理'};
  const check=r=>{if(r.error)throw r.error;return r.data;};
  async function signed(path){
    const cached=signedCache.get(path);if(cached && cached.until>Date.now())return cached.url;
    const url=check(await client.storage.from('album-staging').createSignedUrl(path,3600)).signedUrl;
    signedCache.set(path,{url,until:Date.now()+3000000});return url;
  }
  async function sync(){
    if(!client || !window.ForeverAlbum)return;
    if(syncing){again=true;return;}syncing=true;const generation=epoch;
    try{
      if(!user){await window.ForeverAlbum.mergeUploads([]);list.replaceChildren();return;}
      // Pagination avoids silently losing pending uploads when the history grows.
      let rows=[];
      for(let offset=0;;offset+=200){const batch=check(await client.from('album_uploads').select('*').order('created_at',{ascending:false}).range(offset,offset+199));rows.push(...batch);if(batch.length<200)break;}
      const temporary=[];const cards=[];
      for(const row of rows){
        if(generation!==epoch)return;
        const path=`${row.owner_id}/${row.id}`;let src=`photos/${row.id}.jpg`,thumb=`thumbs/${row.id}.jpg`;
        if(['queued','archived'].includes(row.status)){
          try { [src,thumb]=await Promise.all([signed(path+'/original.jpg'),signed(path+'/thumb.jpg')]); }
          catch(_){continue;}
        }
        if(row.status!=='staging')temporary.push({src,thumb,date:row.photo_date||'',caption:row.caption,uploadId:row.id,temporary:true});
        if(cards.length>=30)continue;
        const card=document.createElement('div');card.className='upload-item';
        const image=document.createElement('img');image.alt='';if(row.status!=='staging')image.src=thumb;
        const info=document.createElement('span');info.textContent=row.caption||'照片';
        const label=document.createElement('small');label.textContent=names[row.status]+(row.last_error?' · 后台将重试':'');info.append(label);
        card.append(image,info);
        if(row.status==='staging' && row.owner_id===user.id){
          const retry=document.createElement('button');retry.textContent='重试';retry.onclick=async()=>{
            retry.disabled=true;
            try{if(retries.has(row.id))await sendFiles(retries.get(row.id));check(await client.rpc('album_finish_upload',{upload_id:row.id}));retries.delete(row.id);await sync();}
            catch(_){status.textContent='文件尚未完整上传。请重新选择这张照片上传；完整的待处理照片不会丢失。';}
            finally{retry.disabled=false;}
          };card.append(retry);
        }else if(row.status!=='staging'){
          const view=document.createElement('button');view.textContent='查看';view.onclick=()=>{dialog.close();window.ForeverAlbum.openUpload(row.id);};card.append(view);
        }
        cards.push(card);
      }
      if(generation!==epoch)return;
      await window.ForeverAlbum.mergeUploads(temporary);
      if(generation!==epoch){again=true;return;}list.replaceChildren(...cards);
    }catch(_){if(user)status.textContent='照片同步暂不可用，请稍后重试。首次使用需先配置上传服务。';}
    finally{syncing=false;if(again){again=false;sync();}}
  }
  async function prepare(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('请选 12MB 以内的 JPEG、PNG 或 WebP 照片。');
    let bitmap;
    try { bitmap=await createImageBitmap(file); }
    catch (_) { throw new Error('这张照片无法解码，请转换为 JPEG 后重试。'); }
    try{
      if(bitmap.width*bitmap.height>60000000)throw new Error('照片分辨率过大，请先缩小后上传。');
      async function jpeg(max,quality){const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片转换失败')),'image/jpeg',quality));}
      return {original:file.type==='image/jpeg'?file:await jpeg(4096,.92),thumb:await jpeg(640,.85)};
    }finally{bitmap.close();}
  }
  async function sendFiles(task){
    for(const kind of ['original','thumb']){
      const r=await client.storage.from('album-staging').upload(`${task.owner}/${task.id}/${kind}.jpg`,task[kind],{contentType:'image/jpeg',upsert:false});
      // Immutable UUID paths make a repeated upload safe. Confirm an existing file before continuing.
      if(r.error){const found=await client.storage.from('album-staging').download(`${task.owner}/${task.id}/${kind}.jpg`);if(found.error || found.data.size!==task[kind].size)throw r.error;}
    }
  }
  // One photo end to end: register, send both files, mark complete. Returns the upload id.
  async function uploadOne(file,caption,date){
    if(!user)throw new Error('请先登录。');
    const owner=user.id,generation=epoch;
    const blobs=await prepare(file),id=crypto.randomUUID();
    if(generation!==epoch)throw new Error('登录状态已变化，请重新登录后继续。');
    check(await client.from('album_uploads').insert({id,owner_id:owner,caption:String(caption||'').trim().slice(0,200),photo_date:date||null}));
    const task={id,owner,...blobs};retries.set(id,task);
    await sendFiles(task);check(await client.rpc('album_finish_upload',{upload_id:id}));retries.delete(id);
    return id;
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!user)return;
    const files=[...form.elements.photos.files];if(!files.length||files.length>10){status.textContent='每次请选择 1～10 张照片。';return;}
    busy=true;const submit=form.querySelector('button');submit.disabled=true;const generation=epoch;
    let successes=0;
    try{
      for(const file of files){
        if(generation!==epoch)throw new Error('登录状态已变化，请重新登录后继续。');
        status.textContent=`正在上传 ${successes+1} / ${files.length}：${file.name}`;
        await uploadOne(file,file.name.replace(/\.[^.]+$/,''),form.elements.date.value);successes++;
      }
      form.reset();status.textContent=`${successes} 张照片已上传。后台归档会继续进行，可以关闭页面。`;
    }catch(error){status.textContent=`已完成 ${successes} 张。${error.message||'上传失败，请检查网络并重试。'}`;}
    finally{busy=false;submit.disabled=false;await sync();}
  };
  async function sessionChanged(state){
    const next=state?.user||null;if(next?.id===user?.id)return;
    ++epoch;user=next;retries.clear();signedCache.clear();if(channel){client.removeChannel(channel);channel=null;}
    form.hidden=!user;q('[data-login]').hidden=!!user;q('[data-signin]').hidden=!!user;status.textContent='';
    if(user)channel=client.channel('album-upload-events').on('postgres_changes',{event:'*',schema:'public',table:'album_uploads'},()=>sync()).subscribe(s=>{if(s==='SUBSCRIBED')sync();});
    await sync();
  }
  window.ForeverUploads={
    upload:uploadOne,
    refresh:()=>sync()
  };
  if(!client){status.textContent='登录服务未加载，请刷新页面。';q('[data-signin]').disabled=true;return;}
  // Membership is already checked by ForeverAuth; state is null for non-members.
  auth.onChange(state=>sessionChanged(state));
  window.addEventListener('forever-album-ready',sync);window.addEventListener('online',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  setInterval(()=>{if(user&&!document.hidden)sync();},60000);
})();
