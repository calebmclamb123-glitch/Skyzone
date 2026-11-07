const member$=s=>document.querySelector(s);
const authPanel=member$("#memberAuth"),profilePanel=member$("#memberProfile"),chatSignInNotice=member$("#chatSignInNotice"),loginForm=member$("#memberLoginForm"),registerForm=member$("#memberRegisterForm"),chatForm=member$("#chatForm"),messagesBox=member$("#chatMessages"),authStatus=member$("#memberAuthStatus"),chatStatus=member$("#chatStatus");
let currentMember=null,selectedAttachment=null,currentChannel="general",replyingTo="",activeFriendId="";
async function memberApi(url,options={}){const response=await fetch(url,{...options,credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})}});let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.error||"Something went wrong.");return data}
function memberEsc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setMember(member){currentMember=member;authPanel.hidden=!!member;profilePanel.hidden=!member;chatSignInNotice.hidden=!!member;chatForm.hidden=!member||currentChannel==="announcements";if(member){member$("#memberProfileName").textContent=member.username;const preview=member$("#memberAvatarPreview");preview.src=member.avatar||"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='32' fill='%236b58a8'/%3E%3Ctext x='50%25' y='55%25' font-size='28' text-anchor='middle' fill='white'%3E"+encodeURIComponent(member.username.slice(0,1).toUpperCase())+"%3C/text%3E%3C/svg%3E";member$("#chatForm input[name=body]").placeholder="Message #general";}else{messagesBox.innerHTML='<p class="chat-empty">Log in or create a free account to view and join the conversation.</p>';}}
function renderMemberMessages(messages){
 if(!currentMember){messagesBox.innerHTML='<p class="chat-empty">Log in to view the conversation.</p>';return}
 if(!messages.length){messagesBox.innerHTML='<p class="chat-empty">No messages yet. Start the conversation!</p>';return}
 messagesBox.innerHTML=messages.map(m=>{
  const time=new Date(m.createdAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  const initial=memberEsc((m.name||"?").slice(0,1).toUpperCase());
  const avatar=m.avatar?'<div class="chat-avatar"><img class="chat-avatar-image" src="'+memberEsc(m.avatar)+'" alt=""></div>':'<div class="chat-avatar">'+initial+'</div>';
  const attachment=m.attachment?'<a class="chat-image-link" href="'+memberEsc(m.attachment)+'" target="_blank" rel="noopener"><img class="chat-image-attachment" src="'+memberEsc(m.attachment)+'" alt="Chat attachment"></a>':'';
  const reactions=Object.entries(m.reactions||{}).map(([emoji,ids])=>'<button class="chat-reaction '+(ids.includes(currentMember.id)?'selected':'')+'" data-reaction="'+emoji+'" data-id="'+m.id+'" type="button">'+emoji+' '+ids.length+'</button>').join("");
  const own=m.memberId===currentMember.id;
  const actions='<div class="chat-message-actions"><button class="chat-message-reply" data-id="'+m.id+'" type="button">Reply</button>'+['👍','❤️','😂','🎉','👀'].map(e=>'<button class="chat-reaction-add" data-reaction="'+e+'" data-id="'+m.id+'" type="button" aria-label="React '+e+'">'+e+'</button>').join("")+(own?'<button class="chat-message-edit" data-id="'+m.id+'" type="button">Edit</button><button class="chat-message-delete" data-id="'+m.id+'" type="button">Delete</button>':'')+'</div>';
  const reply=m.replyTo?'<small class="chat-reply-label">↳ Replying to a message</small>':'';
  return '<article class="chat-message" data-message="'+m.id+'">'+avatar+'<div class="chat-message-content"><div class="chat-message-top"><strong>'+memberEsc(m.name)+'</strong><time>'+time+(m.editedAt?' · edited':'')+'</time></div>'+reply+(m.body?'<p>'+memberEsc(m.body)+'</p>':'')+attachment+'<div class="chat-reactions">'+reactions+'</div>'+actions+'</div></article>';
 }).join("");
 messagesBox.scrollTop=messagesBox.scrollHeight;
}
async function refreshMemberChat(){if(!currentMember)return;try{const messages=await memberApi("/api/chat?channel="+encodeURIComponent(currentChannel));renderMemberMessages(messages)}catch(e){messagesBox.innerHTML='<p class="chat-empty">'+memberEsc(e.message)+'</p>'}}
async function switchChatChannel(channel){
 currentChannel=channel;
 member$("#cancelChatReply").addEventListener("click",()=>{replyingTo="";member$("#chatReplyStatus").hidden=true});
function friendEsc(s){return memberEsc(s)}
async function refreshFriends(){
 const data=await memberApi("/api/friends");
 member$("#incomingFriends").innerHTML=data.incoming.length?data.incoming.map(f=>'<div class="friend-row"><span>'+friendEsc(f.username)+'</span><button data-accept="'+f.requestId+'">Accept</button><button data-decline="'+f.requestId+'">Ignore</button></div>').join(""):'<small>No pending requests.</small>';
 member$("#friendsList").innerHTML=data.friends.length?data.friends.map(f=>'<div class="friend-row"><button class="friend-open" data-friend="'+f.id+'">'+friendEsc(f.username)+'</button><button data-unfriend="'+f.id+'">Remove</button></div>').join(""):'<small>No friends yet. Send a request above.</small>';
}
async function refreshDM(){
 if(!activeFriendId)return;
 const messages=await memberApi("/api/dms?with="+encodeURIComponent(activeFriendId));
 member$("#dmMessages").innerHTML=messages.map(m=>'<div class="dm-message '+(m.from===currentMember.id?'mine':'')+'"><p>'+friendEsc(m.body)+'</p><small>'+new Date(m.createdAt).toLocaleString()+'</small></div>').join("")||'<small>No messages yet. Say hello!</small>';
 member$("#dmMessages").scrollTop=member$("#dmMessages").scrollHeight;
}

member$("#openFriendsPanel").addEventListener("click",async()=>{member$("#friendsPanel").hidden=false;try{await refreshFriends()}catch(e){member$("#friendsStatus").textContent=e.message}});
member$("#closeFriendsPanel").addEventListener("click",()=>member$("#friendsPanel").hidden=true);
member$("#addFriendForm").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await memberApi("/api/friends/requests",{method:"POST",body:JSON.stringify({username:f.get("username")})});member$("#friendsStatus").textContent="Friend request sent to "+r.username+".";e.currentTarget.reset();await refreshFriends()}catch(err){member$("#friendsStatus").textContent=err.message}});
member$("#friendsPanel").addEventListener("click",async e=>{const a=e.target.closest("[data-accept]"),d=e.target.closest("[data-decline]"),u=e.target.closest("[data-unfriend]"),open=e.target.closest("[data-friend]");try{
 if(a){await memberApi("/api/friends/requests/"+a.dataset.accept+"/accept",{method:"POST"});await refreshFriends()}
 if(d){await memberApi("/api/friends/requests/"+d.dataset.decline,{method:"DELETE"});await refreshFriends()}
 if(u){await memberApi("/api/friends/"+u.dataset.unfriend,{method:"DELETE"});activeFriendId="";member$("#dmPanel").hidden=true;await refreshFriends()}
 if(open){activeFriendId=open.dataset.friend;member$("#dmPanel").hidden=false;member$("#dmHeading").textContent="Direct message · "+open.textContent;await refreshDM()}
 }catch(err){member$("#friendsStatus").textContent=err.message}});
member$("#dmForm").addEventListener("submit",async e=>{e.preventDefault();if(!activeFriendId)return;const body=e.currentTarget.elements.body.value.trim();try{await memberApi("/api/dms",{method:"POST",body:JSON.stringify({to:activeFriendId,body})});e.currentTarget.reset();await refreshDM()}catch(err){member$("#friendsStatus").textContent=err.message}});

document.querySelectorAll("[data-channel]").forEach(b=>b.classList.toggle("active",b.dataset.channel===channel));
 const names={general:"Everyday community conversation",announcements:"Community updates and news",media:"Share images and GIFs"};
 member$("#chatChannelName").textContent=channel;member$("#chatWelcomeChannel").textContent="#"+channel;member$("#chatChannelTopic").textContent=names[channel]||"Community channel";
 chatForm.elements.body.placeholder="Message #"+channel;
 chatForm.hidden=!currentMember||channel==="announcements";
 chatStatus.textContent=channel==="announcements"?"Announcements are read-only for members.": "Messages are public. Never share passwords, addresses, or private information.";
 await refreshMemberChat();
}
async function updatePresence(){if(!currentMember)return;try{await memberApi("/api/members/presence",{method:"POST"});const data=await memberApi("/api/members/online");member$("#onlineMemberCount").textContent=data.count+" online";}catch{}}
async function loadMember(){try{const member=await memberApi("/api/members/me");setMember(member);await refreshMemberChat();await updatePresence()}catch{setMember(null)}}
function readImage(file,maxBytes){return new Promise((resolve,reject)=>{if(!file)return resolve("");if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))return reject(new Error("Choose a PNG, JPG, WEBP, or GIF image."));if(file.size>maxBytes)return reject(new Error("That image is too large. Please choose a smaller file."));const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Could not read that image."));reader.readAsDataURL(file)})}
member$("#showLogin").onclick=()=>{loginForm.hidden=false;registerForm.hidden=true;member$("#showLogin").classList.add("active");member$("#showRegister").classList.remove("active");authStatus.textContent=""};
member$("#showRegister").onclick=()=>{loginForm.hidden=true;registerForm.hidden=false;member$("#showRegister").classList.add("active");member$("#showLogin").classList.remove("active");authStatus.textContent=""};
loginForm.addEventListener("submit",async e=>{e.preventDefault();const button=loginForm.querySelector("button");button.disabled=true;authStatus.textContent="Signing in…";try{const f=new FormData(loginForm);const member=await memberApi("/api/members/login",{method:"POST",body:JSON.stringify({email:f.get("email"),password:f.get("password")})});setMember(member);authStatus.textContent="";loginForm.reset();await refreshMemberChat()}catch(err){authStatus.textContent=err.message}finally{button.disabled=false}});
registerForm.addEventListener("submit",async e=>{e.preventDefault();const button=registerForm.querySelector("button");button.disabled=true;authStatus.textContent="Creating your account…";try{const f=new FormData(registerForm);const member=await memberApi("/api/members/register",{method:"POST",body:JSON.stringify({username:f.get("username"),email:f.get("email"),password:f.get("password")})});setMember(member);authStatus.textContent="";registerForm.reset();await refreshMemberChat()}catch(err){authStatus.textContent=err.message}finally{button.disabled=false}});
member$("#memberLogout").onclick=async()=>{try{await memberApi("/api/members/logout",{method:"POST"})}catch{}setMember(null)};
member$("#avatarFile").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;authStatus.textContent="Uploading profile picture…";try{const avatar=await readImage(file,400*1024);const result=await memberApi("/api/members/avatar",{method:"PUT",body:JSON.stringify({avatar})});setMember({...currentMember,avatar:result.avatar});chatStatus.textContent="Profile picture updated."}catch(err){chatStatus.textContent=err.message}finally{e.target.value="";authStatus.textContent=""}});
member$("#chatAttachment").addEventListener("change",e=>{const file=e.target.files[0];selectedAttachment=file||null;member$("#chatAttachmentName").textContent=file?file.name:"";});
chatForm.addEventListener("submit",async e=>{e.preventDefault();if(!currentMember)return;const button=chatForm.querySelector("button[type=submit]");const body=chatForm.elements.body.value.trim();if(!body&&!selectedAttachment){chatStatus.textContent="Write a message or attach an image/GIF.";return}button.disabled=true;chatStatus.textContent="Sending…";try{const attachment=selectedAttachment?await readImage(selectedAttachment,700*1024):"";await memberApi("/api/chat",{method:"POST",body:JSON.stringify({body,attachment,channelId:currentChannel,replyTo:replyingTo})});chatForm.elements.body.value="";replyingTo="";member$("#chatReplyStatus").hidden=true;selectedAttachment=null;member$("#chatAttachment").value="";member$("#chatAttachmentName").textContent="";chatStatus.textContent="Message sent.";await refreshMemberChat()}catch(err){chatStatus.textContent=err.message}finally{button.disabled=false}});

document.querySelectorAll("[data-channel]").forEach(button=>button.addEventListener("click",()=>switchChatChannel(button.dataset.channel)));
messagesBox.addEventListener("click",async e=>{
 const reaction=e.target.closest("[data-reaction][data-id]");
 const edit=e.target.closest(".chat-message-edit");
 const del=e.target.closest(".chat-message-delete");
 try{
  if(reaction){await memberApi("/api/chat/"+reaction.dataset.id+"/reactions",{method:"POST",body:JSON.stringify({emoji:reaction.dataset.reaction})});await refreshMemberChat()}
  if(e.target.closest(".chat-message-reply")){const id=e.target.closest(".chat-message-reply").dataset.id;replyingTo=id;const item=e.target.closest(".chat-message");const author=item.querySelector(".chat-message-top strong")?.textContent||"member";member$("#chatReplyStatus").hidden=false;member$("#chatReplyText").textContent="Replying to "+author;chatForm.elements.body.focus()}
  if(edit){const article=edit.closest(".chat-message");const current=article.querySelector(".chat-message-content p")?.textContent||"";const body=prompt("Edit your message",current);if(body===null)return;await memberApi("/api/chat/"+edit.dataset.id,{method:"PATCH",body:JSON.stringify({body})});await refreshMemberChat()}
  if(del&&confirm("Delete this message?")){await memberApi("/api/chat/"+del.dataset.id,{method:"DELETE"});await refreshMemberChat()}
 }catch(err){chatStatus.textContent=err.message}
});
loadMember();setInterval(refreshMemberChat,7000);setInterval(updatePresence,30000);
