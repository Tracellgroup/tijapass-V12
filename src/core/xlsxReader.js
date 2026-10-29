/* Self-contained CSV/TSV and basic XLSX reader, kept from V9. No third-party service receives uploaded files. */
import {parseDelimited} from './statements.js';
const decoder = new TextDecoder();
function uint16(v,at){return v.getUint16(at,true);}
function uint32(v,at){return v.getUint32(at,true);}
async function zipEntries(buffer){
 const view=new DataView(buffer); const bytes=new Uint8Array(buffer); const files={};
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(uint32(view,i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Invalid Excel workbook (ZIP structure not found).');
 const count=uint16(view,end+10);let off=uint32(view,end+16);
 for(let i=0;i<count;i++){
  if(uint32(view,off)!==0x02014b50)throw Error('Invalid Excel directory.');
  const method=uint16(view,off+10), size=uint32(view,off+20),nameLen=uint16(view,off+28),extra=uint16(view,off+30),comment=uint16(view,off+32),local=uint32(view,off+42);
  const name=decoder.decode(bytes.slice(off+46,off+46+nameLen));off+=46+nameLen+extra+comment;
  if(!/^(xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml))$/.test(name))continue;
  const start=local+30+uint16(view,local+26)+uint16(view,local+28);const slice=bytes.slice(start,start+size);
  if(method===0){files[name]=decoder.decode(slice);continue;}
  if(method!==8)throw Error('Unsupported Excel compression method.');
  try{const stream=new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   files[name]=await new Response(stream).text();}catch{throw Error('This browser cannot decompress .xlsx here. Save the statement as CSV in Excel, then import the CSV.');}
 }
 return files;
}
function parseXML(src){const dom=new DOMParser().parseFromString(src,'application/xml'); if(dom.querySelector('parsererror'))throw Error('Invalid Excel XML');return dom;}
function childText(node,name){const e=node.getElementsByTagName(name)[0];return e?e.textContent:'';}
export async function readStatementFile(file){
 const name=file.name.toLowerCase();
 if(/\.(csv|tsv|txt)$/.test(name))return parseDelimited(await file.text());
 if(!name.endsWith('.xlsx'))throw Error('Use PDF, CSV, TSV or XLSX.');
 const files=await zipEntries(await file.arrayBuffer());
 const shared=files['xl/sharedStrings.xml']?Array.from(parseXML(files['xl/sharedStrings.xml']).getElementsByTagName('si')).map(si=>si.textContent):[];
 const sheet=files['xl/worksheets/sheet1.xml'] || files[Object.keys(files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0]];
 if(!sheet)throw Error('No worksheet found.');
 const doc=parseXML(sheet);
 const rows=[];
 for(const r of doc.getElementsByTagName('row')){
  const cells=[];
  for(const c of Array.from(r.children).filter(x=>x.localName==='c')){
   const label=c.getAttribute('r')||'';const letters=(label.match(/^[A-Z]+/)||[])[0];if(!letters)continue;
   let index=0;for(const char of letters)index=index*26+char.charCodeAt(0)-64;index--;
   const value=childText(c,'v');const type=c.getAttribute('t');
   cells[index]=type==='s'?String(shared[Number(value)]??''):type==='inlineStr'?childText(c,'is'):value;
  }
  if(cells.length)rows.push(Array.from({length:cells.length},(_,i)=>cells[i]||''));
 }
 return rows;
}
