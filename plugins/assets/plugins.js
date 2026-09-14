const root = document.documentElement;
const feedback = document.getElementById('feedback');
const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const words = {
  ko: {
    'Obsidian':'Markdown 파일을 로컬 볼트에 저장하고 연결하는 노트 앱입니다.',
    'Eagle':'이미지와 디자인 자료를 라이브러리로 관리하는 데스크톱 앱입니다.',
    'Zotero':'문헌 정보와 첨부파일, 주석을 관리하는 레퍼런스 매니저입니다.',
    'Better BibTeX':'Zotero에서 인용 키와 문헌 내보내기를 확장하는 플러그인입니다.',
    'Markdown':'제목, 목록, 링크를 텍스트 기호로 작성하는 문서 형식입니다.',
    'GitHub Pages':'GitHub 저장소의 정적 파일을 웹사이트로 게시하는 서비스입니다.',
    'GitHub':'Git 저장소와 소프트웨어 릴리스를 호스팅하는 서비스입니다.',
    'API 키':'외부 서비스 호출 권한을 증명하는 비밀 값입니다. 공개 문서에 넣지 마세요.',
    'API':'프로그램이 다른 서비스에 요청하고 결과를 받는 인터페이스입니다.',
    '백엔드':'공유 페이지와 데이터를 저장하고 제공하는 서버 또는 호스팅 방식입니다.',
    '볼트':'Obsidian 노트와 설정이 저장되는 로컬 폴더입니다.',
    '프론트매터':'Markdown 맨 위에 YAML로 적는 제목, 태그 등의 속성 영역입니다.',
    'YAML':'문서 속성과 설정을 키와 값으로 표현하는 텍스트 형식입니다.',
    '임베드':'외부 파일이나 다른 자료를 노트 안에서 직접 표시하는 방식입니다.',
    '라이브러리':'Eagle이나 Zotero가 관리하는 자료의 묶음입니다.',
    '인용 키':'문헌을 간단한 텍스트 식별자로 가리키는 값입니다. citekey라고도 부릅니다.',
    'citekey':'인용문에서 특정 문헌을 가리키는 텍스트 식별자입니다.',
    'RAG':'관련 자료를 검색해 AI가 답변할 때 참고하도록 제공하는 방식입니다.',
    '임베딩':'텍스트의 유사성을 찾기 위해 내용을 숫자 표현으로 바꾸는 과정입니다.',
    'MCP':'AI 도구와 외부 기능을 연결하는 통신 규약입니다.',
    'OAuth':'비밀번호를 직접 전달하지 않고 서비스 접근을 승인하는 인증 방식입니다.',
    '로컬 경로':'지금 컴퓨터 안에서 파일이 놓인 위치입니다. 다른 기기에서는 다를 수 있습니다.',
    '슬러그':'웹 주소 끝에서 특정 페이지를 구분하는 짧은 문자열입니다.',
    '마이그레이션':'기존 링크나 파일 구조를 다른 방식으로 옮기는 작업입니다. 백업과 범위 검토가 필요합니다.',
    'Cloudflare R2':'파일을 저장하고 전달하는 오브젝트 스토리지 서비스입니다.',
    '암호화':'키 없이는 내용을 읽기 어렵게 데이터를 변환하는 처리입니다. 어떤 데이터까지 적용되는지 확인해야 합니다.',
    '명령 팔레트':'Obsidian 명령을 이름으로 검색해 실행하는 메뉴입니다.'
  },
  en: {
    'Obsidian':'A note app that stores connected Markdown files in a local vault.',
    'Eagle':'A desktop library manager for images and design assets.',
    'Zotero':'A reference manager for literature, attachments and annotations.',
    'Better BibTeX':'A Zotero extension for citation keys and bibliography export.',
    'Markdown':'A plain-text document format using symbols for headings, lists and links.',
    'GitHub Pages':'A service that publishes static files from a GitHub repository as a website.',
    'GitHub':'A hosting service for Git repositories and software releases.',
    'API key':'A secret credential authorizing requests to a service. Never publish it.',
    'API':'An interface through which software requests a service and receives results.',
    'backend':'The server or hosting provider that stores and serves shared content.',
    'vault':'The local folder containing Obsidian notes and settings.',
    'frontmatter':'The YAML metadata block at the beginning of a Markdown document.',
    'YAML':'A text format for configuration and key-value metadata.',
    'embed':'Display another file or resource inside a note.',
    'library':'A collection of material managed by Eagle or Zotero.',
    'citation key':'A short text identifier pointing to a specific literature item.',
    'citekey':'A short text identifier used to cite a specific literature item.',
    'RAG':'Retrieving relevant material to supply as context for an AI answer.',
    'embedding':'A numeric representation of text used to find related content.',
    'MCP':'A protocol connecting AI tools with external capabilities.',
    'OAuth':'An authorization flow granting access without sharing a password directly.',
    'local path':'A file location on this computer that may differ on another device.',
    'slug':'A short string identifying a page at the end of a URL.',
    'migration':'Changing an existing link or file structure. Review scope and back up first.',
    'Cloudflare R2':'An object storage service for storing and delivering files.',
    'encryption':'Transforming data so a key is required to read it. Check which assets are covered.',
    'command palette':'An Obsidian menu for finding and running commands by name.'
  }
};
function applyLanguage(lang) {
  const active = document.activeElement;
  const oldEdition = active?.closest('[data-lang]');
  root.lang = lang;
  store('cmds-lang', lang);
  const url = new URL(location.href); url.searchParams.set('lang', lang);
  if(url.hash && /^#(ko|en)-/.test(url.hash) && !url.hash.startsWith(`#${lang}-`)) url.hash='';
  history.replaceState(null,'',url);
  document.querySelectorAll('[data-ko][data-en]').forEach(el => el.textContent = el.dataset[lang]);
  document.getElementById('language').textContent = lang === 'ko' ? 'EN' : 'KO';
  document.getElementById('language').setAttribute('aria-label', lang==='ko'?'Switch to English':'한국어로 전환');
  document.getElementById('theme').setAttribute('aria-label',lang==='ko'?'밝은 테마와 어두운 테마 전환':'Toggle light and dark theme');
  if(oldEdition && oldEdition.dataset.lang!==lang) document.getElementById('language').focus();
  hideTip();
  if (feedback) feedback.textContent = lang === 'ko' ? '한국어 설명서' : 'English guide';
}
document.getElementById('language').addEventListener('click',()=>applyLanguage(root.lang==='ko'?'en':'ko'));
document.getElementById('theme').addEventListener('click',()=>{
  const dark = root.dataset.theme ? root.dataset.theme==='dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  root.dataset.theme=dark?'light':'dark';store('cmds-theme',root.dataset.theme);
});
const tip = document.getElementById('glossTip');
let suppressTip = false;
function hideTip(){if(tip)tip.hidden=true;}
function showTip(el){
  if(suppressTip)return;
  tip.textContent=el.dataset.gloss;tip.hidden=false;
  const rect=el.getBoundingClientRect(), box=tip.getBoundingClientRect();
  const top=rect.bottom+9+box.height>innerHeight?rect.top-box.height-9:rect.bottom+9;
  tip.style.left=Math.max(16,Math.min(innerWidth-box.width-16,rect.left))+'px';
  tip.style.top=Math.max(85,top)+'px';
}
for(const edition of document.querySelectorAll('.product-page [data-lang]')) {
  const lang=edition.dataset.lang, prose=edition.querySelector('.prose');
  if(!prose)continue;
  prose.querySelectorAll('table').forEach(table=>{
    const wrap=document.createElement('div');wrap.className='table-scroll';wrap.tabIndex=0;
    wrap.setAttribute('role','region');wrap.setAttribute('aria-label',lang==='ko'?'표: 가로 스크롤 가능':'Table: scroll horizontally');
    table.replaceWith(wrap);wrap.append(table);
  });
  prose.querySelectorAll('pre').forEach(pre=>{
    const text=pre.querySelector('code')?.textContent||pre.textContent;
    const button=document.createElement('button');button.className='copy-code';button.textContent=lang==='ko'?'복사':'Copy';
    button.addEventListener('click',async()=>{
      try {await navigator.clipboard.writeText(text);button.textContent=lang==='ko'?'복사됨':'Copied';}
      catch {button.textContent=lang==='ko'?'선택 후 복사':'Select to copy';const r=document.createRange();r.selectNodeContents(pre.querySelector('code')||pre);const s=getSelection();s.removeAllRanges();s.addRange(r);}
      setTimeout(()=>button.textContent=lang==='ko'?'복사':'Copy',2200);
    });pre.append(button);
  });
  const dictionary=words[lang];
  const escaped=Object.keys(dictionary).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const pattern=new RegExp(escaped.join('|'),'g');
  let seen=new Set();
  const walker=document.createTreeWalker(prose,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  let previousSection=null;
  for(const node of nodes){
    if(node.parentElement.closest('a,code,pre,button,h1,h2,h3,h4,script,.doc-meta'))continue;
    let section=null;
    for(const h of prose.querySelectorAll('h2,h3')){if(h.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)section=h;else break;}
    if(section!==previousSection){seen=new Set();previousSection=section;}
    const text=node.textContent;pattern.lastIndex=0;let match,last=0;const frag=document.createDocumentFragment();let changed=false;
    while((match=pattern.exec(text))){
      const term=match[0];
      if(seen.has(term))continue;
      // Avoid treating API in a longer English identifier as a glossary term.
      if(/[a-z]/i.test(term[0]) && /[a-z0-9_]/i.test(text[match.index-1]||''))continue;
      if(/[a-z]/i.test(term.at(-1)) && /[a-z0-9_]/i.test(text[match.index+term.length]||''))continue;
      frag.append(text.slice(last,match.index));
      const span=document.createElement('span');span.className='gloss';span.tabIndex=0;span.textContent=term;span.dataset.gloss=dictionary[term];span.setAttribute('aria-describedby','glossTip');
      span.addEventListener('mouseenter',()=>{suppressTip=false;showTip(span)});span.addEventListener('mouseleave',hideTip);span.addEventListener('focus',()=>{suppressTip=false;showTip(span)});span.addEventListener('blur',hideTip);span.addEventListener('click',()=>{suppressTip=false;showTip(span)});
      frag.append(span);seen.add(term);last=match.index+term.length;changed=true;
    }
    if(changed){frag.append(text.slice(last));node.replaceWith(frag);}
  }
}
let scrollTimer;
addEventListener('scroll',()=>{root.classList.add('scrolling');clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>root.classList.remove('scrolling'),900);const active=document.activeElement;if(active?.classList.contains('gloss'))showTip(active);else hideTip();},{capture:true,passive:true});
addEventListener('keydown',e=>{if(e.key==='Escape'){suppressTip=true;hideTip();}});
if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      const edition=entry.target.closest('[data-lang]');
      edition?.querySelectorAll('.toc a').forEach(a=>a.classList.toggle('active',decodeURIComponent(a.hash)==='#'+entry.target.id));
    }
  },{rootMargin:'-90px 0px -65% 0px'});
  document.querySelectorAll('.prose h2,.prose h3').forEach(h=>observer.observe(h));
}
// A deep link identifies its language even when a prior visit saved another one.
const hashLang=location.hash.match(/^#(ko|en)-/)?.[1];
applyLanguage(hashLang||root.lang);
