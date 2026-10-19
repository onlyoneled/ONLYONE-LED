// planner/js/resolume.js — Resolume Arena 7.x Advanced Output 프리셋 XML
// 실제 Arena에서 열어 검증하지 않은 형식이다. 쇼 전에 반드시 테스트할 것.
import { rectCorners } from './engine.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => (Math.round(v * 1000) / 1000).toString();
let seq = 1;
const uniq = () => String(Date.now()) + String(seq++).padStart(4, '0');

function verts(tag, rect, rot) {
  const pts = rot ? rectCorners(rect, rot) : rectCorners(rect, 0);
  return `<${tag} orientation="0">${pts.map(([x, y]) => `<v x="${n(x)}" y="${n(y)}"/>`).join('')}</${tag}>`;
}

function sliceXml(s) {
  const id = uniq();
  return `<Slice uniqueId="${id}">`
    + `<Params name="Common"><Param name="Name" T="STRING" default="Layer" value="${esc(s.name)}"/><Param name="Enabled" T="BOOL" default="1" value="1"/></Params>`
    + `<Params name="Input"><ParamChoice name="Input Source" default="0:1" value="0:1" storeChoices="0"/></Params>`
    + `<InputRect orientation="0">${rectCorners(s.in, 0).map(([x, y]) => `<v x="${n(x)}" y="${n(y)}"/>`).join('')}</InputRect>`
    + verts('OutputRect', s.out, s.rot || 0)
    + `</Slice>`;
}

function screenXml(output, idx, slices) {
  const id = uniq();
  return `<Screen name="${esc(output.name)}" uniqueId="${id}">`
    + `<Params name="Params"><Param name="Name" T="STRING" default="" value="${esc(output.name)}"/><Param name="Enabled" T="BOOL" default="1" value="1"/></Params>`
    + `<guides/>`
    + `<layers>${slices.map(sliceXml).join('')}</layers>`
    + `<OutputDevice><OutputDeviceVirtual name="${esc(output.name)}" deviceId="VirtualScreen ${idx + 1}" idHash="${id}" width="${output.w}" height="${output.h}"><Params name="Params"><Param name="Width" T="DOUBLE" default="1920" value="${output.w}"/><Param name="Height" T="DOUBLE" default="1080" value="${output.h}"/></Params></OutputDeviceVirtual></OutputDevice>`
    + `</Screen>`;
}

function screensXml(outputs, slices) {
  return outputs.map((o, i) => screenXml(o, i, slices.filter((s) => s.output === i))).join('');
}

export function buildArenaXml({ name, canvasW, canvasH, outputs, slices }) {
  return `<?xml version="1.0" encoding="utf-8"?>\n`
    + `<XmlState name="${esc(name)}">`
    + `<versionInfo name="Resolume Arena" majorVersion="7" minorVersion="0" microVersion="0" revision="0"/>`
    + `<ScreenSetup name="ScreenSetup">`
    + `<Params name="ScreenSetupParams"/>`
    + `<CurrentCompositionTextureSize width="${canvasW}" height="${canvasH}"/>`
    + `<screens>${screensXml(outputs, slices)}</screens>`
    + `<SoftEdging><ScreenSetupSoftEdging/></SoftEdging>`
    + `</ScreenSetup></XmlState>\n`;
}

// 사용자가 Arena에서 저장한 프리셋을 바탕으로 <screens> 부분만 교체한다. 원본은 수정하지 않는다.
export function mergeIntoArenaXml(baseXml, { canvasW, canvasH, outputs, slices }) {
  const doc = new DOMParser().parseFromString(baseXml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('xmlParse');
  const setup = doc.querySelector('ScreenSetup');
  if (!setup) throw new Error('xmlNoSetup');
  const frag = new DOMParser().parseFromString(`<screens>${screensXml(outputs, slices)}</screens>`, 'application/xml').documentElement;
  const old = setup.querySelector(':scope > screens');
  const imported = doc.importNode(frag, true);
  if (old) setup.replaceChild(imported, old); else setup.appendChild(imported);
  const tex = setup.querySelector(':scope > CurrentCompositionTextureSize');
  if (tex) { tex.setAttribute('width', canvasW); tex.setAttribute('height', canvasH); }
  return new XMLSerializer().serializeToString(doc);
}
