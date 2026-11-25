/* Question cards use the existing durable chat transport (versioned, bounded JSON). */
(() => {
  'use strict';
  const prefix = '[forever-question:v1]';
  const drafts = new Map();
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text != null) n.textContent = text; return n; };
  const validText = (v, max) => typeof v === 'string' && v.length <= max;
  function validCard(c) {
    return c && ['choice','text'].includes(c.type) && validText(c.question,180) && c.question.trim() &&
      validText(c.reply,300) && (c.type === 'text' ? c.correct === null && Array.isArray(c.options) && !c.options.length :
      Array.isArray(c.options) && c.options.length >= 2 && c.options.length <= 4 && c.options.every(v=>validText(v,70)&&v.trim()) &&
      (c.correct === null || Number.isInteger(c.correct) && c.correct >= 0 && c.correct < c.options.length));
  }
  function decode(body) {
    if (!body.startsWith(prefix)) return null;
    try {
      const p = JSON.parse(body.slice(prefix.length));
      if (p.kind === 'question' && validCard(p.card)) return p;
      if (p.kind === 'answer' && validCard(p.card) && /^[\da-f-]{36}$/i.test(p.questionId) &&
        (p.card.type === 'text' ? validText(p.answer,400) && p.answer.trim() : Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.card.options.length)) return p;
    } catch (_) {}
    return null;
  }
  function encode(p) { const body = prefix + JSON.stringify(p); if (body.length > 2000) throw new Error('卡片内容太长，请缩短一些。'); return body; }
  function mount({host, compose, send, context}) {
    const launch = el('button','question-launch','✧  给你一道题'); launch.type = 'button';
    compose.prepend(launch);
    const panel = el('section','question-editor'); panel.hidden = true; panel.setAttribute('aria-label','制作问题卡');
    panel.innerHTML = `<header class="question-editor-head"><div><span class="question-eyebrow">一问一答 · 更懂彼此</span><h3>有个问题，想问你</h3></div><button type="button" class="chat-icon" aria-label="收起问题卡">✕</button></header>
      <form class="question-form"><fieldset class="question-types"><legend class="chat-sr-only">题目类型</legend><label><input type="radio" name="type" value="choice" checked><span>选择题</span></label><label><input type="radio" name="type" value="text"><span>问答题</span></label></fieldset>
      <label class="question-label">想问什么<textarea name="question" maxlength="180" required placeholder="下次见面，最想一起做什么？" rows="2"></textarea></label>
      <fieldset class="question-options-editor"><legend>给 TA 的选项 <small>2–4 项 · 单选</small></legend><div class="question-option-fields"></div><button type="button" class="question-add">＋ 添加选项</button></fieldset>
      <label class="question-label question-correct-label">正确选项 <small>可不设置</small><select name="correct"><option value="">不设标准答案，每个选择都值得聊聊</option></select></label>
      <label class="question-label">答复 <small>选填 · 对方作答后揭晓</small><textarea name="reply" maxlength="300" placeholder="写下你的标准答案，或想留给 TA 的话…" rows="3"></textarea></label>
      <p class="question-editor-note">把问题送过去，把心里的话留在揭晓时。</p><p class="chat-error question-error" role="alert"></p><button class="chat-primary" type="submit">送出问题卡 <span aria-hidden="true">↗</span></button></form>`;
    host.append(panel);
    const form = panel.querySelector('form'), fields = panel.querySelector('.question-option-fields');
    const correct = form.elements.correct, error = panel.querySelector('.question-error');
    function refreshOptions() {
      const previous = correct.value; correct.replaceChildren(new Option('不设标准答案，每个选择都值得聊聊',''));
      [...fields.children].forEach((row,i)=>{row.querySelector('span').textContent=String.fromCharCode(65+i); row.querySelector('input').setAttribute('aria-label','选项 '+String.fromCharCode(65+i)); row.querySelector('button').disabled=fields.children.length<=2; correct.add(new Option('选项 '+String.fromCharCode(65+i),String(i)));});
      correct.value = previous; panel.querySelector('.question-add').disabled=fields.children.length>=4;
    }
    function addOption() {
      const row=el('div','question-option-field'); const input=el('input'); input.maxLength=70; input.required=true; input.placeholder='写一个可能的答案';
      const remove=el('button','','−'); remove.type='button'; remove.setAttribute('aria-label','删除这个选项');
      remove.onclick=()=>{correct.value='';row.remove();refreshOptions();}; row.append(el('span'),input,remove);fields.append(row);refreshOptions();
    }
    addOption();addOption();
    panel.querySelector('.question-add').onclick=addOption;
    const close=()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();};
    launch.setAttribute('aria-expanded','false');
    launch.onclick=()=>{panel.hidden=false;launch.setAttribute('aria-expanded','true');form.elements.question.focus();};
    panel.querySelector('.chat-icon').onclick=close;
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
    form.addEventListener('change',()=>{
      const choice=form.elements.type.value==='choice';panel.querySelector('.question-options-editor').hidden=!choice;panel.querySelector('.question-correct-label').hidden=!choice;
      fields.querySelectorAll('input').forEach(n=>n.required=choice);
    });
    form.onsubmit=e=>{
      e.preventDefault(); if(!context().ready) {error.textContent='请等待聊天连接后再发送，内容已保留。';return;}
      const type=form.elements.type.value;
      const card={type,question:form.elements.question.value.trim(),options:type==='choice'?[...fields.querySelectorAll('input')].map(n=>n.value.trim()):[],correct:type==='choice'&&correct.value!==''?Number(correct.value):null,reply:form.elements.reply.value.trim()};
      if(!validCard(card)){error.textContent='请写好问题，并填满每一个选项。';return;}
      if(type==='choice' && new Set(card.options).size!==card.options.length){error.textContent='选项有重复，换一个不同的答案吧。';return;}
      try {if(!send(encode({kind:'question',card})))return;}catch(e){error.textContent=e.message;return;}
      form.reset();fields.replaceChildren();addOption();addOption();form.dispatchEvent(new Event('change'));error.textContent='';close();
    };
    return {
      reset(){drafts.clear();form.reset();fields.replaceChildren();addOption();addOption();form.dispatchEvent(new Event('change'));panel.hidden=true;error.textContent='';launch.setAttribute('aria-expanded','false');},
      render(row, rows) {
        const packet=decode(row.body); if(!packet)return null;
        const {userId,ready}=context(); const mine=row.sender_id===userId;const c=packet.card;
        const box=el('div','question-card');
        box.append(el('div','question-eyebrow',packet.kind==='answer'?'回信已到 · '+(mine?'我的回答':'TA 的回答'):(c.type==='choice'?'选择题':'问答题')+' · 给你的问题'));
        box.append(el('h3','question-title',c.question));
        function reveal(answer) {
          const chosen=c.type==='choice'?c.options[answer]:answer;
          const result=el('div','question-result');result.append(el('span','question-caption','作答'),el('p','',chosen));box.append(result);
          if(c.correct!==null || c.reply){
            const reply=el('div','question-reveal');reply.append(el('span','question-caption','藏在卡片里的答复'));
            if(c.correct!==null){reply.append(el('p','question-verdict',answer===c.correct?'心有灵犀，选中了同一个答案。':'原来你是这样想的，也想听你说说。'),el('p','','标准答案 · '+c.options[c.correct]));}
            if(c.reply)reply.append(el('p','',c.reply));box.append(reply);
          } else box.append(el('p','question-footnote','答案已送达，接着聊聊吧。'));
        }
        if(packet.kind==='answer'){reveal(packet.answer);return box;}
        const responses=[...rows.values()].filter(r=>{const p=decode(r.body);return p?.kind==='answer'&&p.questionId===row.id&&r.sender_id!==row.sender_id;}).sort((a,b)=>(a.seq||Infinity)-(b.seq||Infinity));
        if(responses.length){const response=responses[0];reveal(decode(response.body).answer);if(!response.seq)box.append(el('p','question-footnote',response.delivery==='failed'?'回答尚未送达，请在下方重试。':'正在送出回答…'));return box;}
        if(mine || !row.seq){
          if(c.type==='choice')c.options.forEach((v,i)=>box.append(el('div','question-option static',String.fromCharCode(65+i)+'  '+v)));
          box.append(el('p','question-footnote','等 TA 写下答案'+(c.reply||c.correct!==null?'，再揭晓你的答复。':'。')));
          if(c.reply||c.correct!==null){const details=el('details','question-own-reply');details.append(el('summary','','查看我预留的答复'));if(c.correct!==null)details.append(el('p','','标准答案 · '+c.options[c.correct]));if(c.reply)details.append(el('p','',c.reply));box.append(details);}return box;
        }
        const answerForm=el('form','question-answer-form');const draft=drafts.get(row.id)??(c.type==='choice'?null:'');let value=draft;
        if(c.type==='choice'){
          const choices=el('fieldset','question-choices');choices.append(el('legend','chat-sr-only','选择你的答案'));
          c.options.forEach((v,i)=>{const label=el('label','question-option');const radio=el('input');radio.type='radio';radio.name='answer';radio.value=i;radio.required=true;radio.checked=value===i;radio.onchange=()=>{value=i;drafts.set(row.id,value);};label.append(radio,el('b','',String.fromCharCode(65+i)),el('span','',v));choices.append(label);});answerForm.append(choices);
        }else{const input=el('textarea','question-answer');input.rows=3;input.maxLength=400;input.required=true;input.placeholder='慢慢写，我想听你的答案…';input.setAttribute('aria-label','你的回答');input.value=value;input.oninput=()=>{value=input.value;drafts.set(row.id,value);};answerForm.append(input);}
        const submit=el('button','question-submit',c.reply||c.correct!==null?'提交，揭晓答复':'送出我的回答');submit.type='submit';submit.disabled=!ready;
        answerForm.append(el('p','question-footnote',c.reply||c.correct!==null?'有一份答复，等你答完再打开。':'没有标准答案，只想听听你。'),submit);
        const answerError=el('p','chat-error');answerError.hidden=true;answerError.setAttribute('role','alert');answerForm.append(answerError);
        answerForm.onsubmit=e=>{
          e.preventDefault();if(value===null || typeof value==='string'&&!value.trim())return;
          try {
            if(send(encode({kind:'answer',questionId:row.id,card:c,answer:typeof value==='string'?value.trim():value})))drafts.delete(row.id);
            else {answerError.hidden=false;answerError.textContent='连接恢复后再试，回答已保留。';}
          } catch(error){answerError.hidden=false;answerError.textContent=error.message;}
        };
        box.append(answerForm);return box;
      }
    };
  }
  window.ForeverQuestions={mount,decode,encode};
})();
