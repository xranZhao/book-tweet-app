/* 复用阿野收件箱的 GitHub Contents 上传协议。 */
function renderCloudSettings(){ $('#cloud-settings').innerHTML=`<label>GitHub Token<input type="password" id="github-token" autocomplete="off" value="${escapeHtml(settings.githubToken||'')}"></label><label>稿件仓库<input id="github-repo" value="${escapeHtml(settings.githubRepo||'xranZhao/aye-article-inbox')}"></label><label>存放目录<input id="github-path" value="${escapeHtml(settings.githubPath??'0-原始文稿')}"></label><p class="tip">与阿野收件箱使用同一个有写入权限的 Token，上传 Markdown 后可由电脑端工作流下载。</p>`; }
function saveCloudSettings(){settings.githubToken=$('#github-token').value.trim();settings.githubRepo=$('#github-repo').value.trim();settings.githubPath=$('#github-path').value.trim().replace(/^\/+|\/+$/g,'');}
function cloudFilename(title,id){const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'2-digit',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/\D/g,'');return `${date}_${title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90)||'推文'}_${id.slice(0,8)}.md`;}
async function uploadCloud(){
 await saveQueue;if(!state.draft.trim()||!state.title.trim())return toast('请填写标题和正文');if(!settings.githubToken||!settings.githubRepo){toast('请先设置 GitHub Token 和稿件仓库');openSettings();return;}
 if(!/^[\w.-]+\/[\w.-]+$/.test(settings.githubRepo))return toast('仓库格式应为 用户名/仓库名');
 busy=true;$('#cloud').disabled=true;$('#cloud-status').textContent='正在上传…';
 try{const filename=state.cloudFilename||cloudFilename(state.title,state.id);const path=[settings.githubPath,filename].filter(Boolean).join('/');const url=`https://api.github.com/repos/${settings.githubRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;const headers={Authorization:`Bearer ${settings.githubToken}`,Accept:'application/vnd.github+json'};const check=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});let sha;
 if(check.ok){if(!confirm('云端已有这篇稿件，要用当前编辑内容更新吗？'))return;sha=(await check.json()).sha;}else if(check.status!==404)throw new Error(`无法检查云端稿件（${check.status}）`);
 const content=`# ${state.title}\n\n${state.draft}\n`;const bytes=new TextEncoder().encode(content);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({message:`上传推文：${state.title}`,content:btoa(binary),...(sha?{sha}:{})})});if(!response.ok)throw new Error(`上传失败（${response.status}），文字仍在本地`);
 state.cloudFilename=filename;state.uploaded=new Date().toISOString();await save();await archive();toast('云上传成功');
 }catch(e){toast(e.message);}finally{busy=false;showEditor();}
}
