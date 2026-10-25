import test from 'node:test';
import assert from 'node:assert/strict';
import { navyMask, signedLetterField, clearCropEdges } from '../lib/orb-lettering.js';

test('cropped ornaments disappear while interior letter strokes and disconnected dots survive',()=>{
    const mask = new Uint8Array(64);
    for (const i of [0, 9, 18, 7, 14, 21, 35, 43, 51, 37]) mask[i] = 1;
    clearCropEdges(mask,8,8);
    assert.deepEqual([...mask.entries()].filter(([,v])=>v).map(([i])=>i),[35,37,43,51]);
});

test('letter extraction retains navy ink and rejects paper, ornaments, neutral shadows and transparency',()=>{
    const pixels=new Uint8ClampedArray([
        18,27,69,255, 70,80,130,255, 250,247,226,255, 139,55,40,255,
        85,90,98,255, 197,179,88,255, 18,27,69,0, 20,22,28,255,
    ]);
    assert.deepEqual([...navyMask(pixels)],[1,1,0,0,0,0,0,1]);
});

test('distance fields keep letter holes, thin strokes and separated glyphs rather than filling a plate',()=>{
    const width=20,height=12,mask=new Uint8Array(width*height);
    for(let y=2;y<=9;y++)for(let x=2;x<=8;x++)if(x===2||x===8||y===2||y===9)mask[y*width+x]=1;
    for(let y=2;y<=9;y++)mask[y*width+15]=1;
    const field=signedLetterField(mask,width,height,1.6,.4),at=(x,y)=>field[y*width+x];
    assert.ok(at(2,5)<128,'opaque letter stroke');assert.ok(at(15,5)<128,'thin separated stroke');
    assert.ok(at(5,5)>128,'open interior');assert.ok(at(11,5)>128,'gap between glyphs');assert.ok(at(0,0)>128,'clear background');
    assert.ok(at(5,5)>at(3,5),'distance grows away from ink');
    const precise=signedLetterField(mask,width,height,1.6,.4,65535);
    assert.ok(precise instanceof Uint16Array);
    for(let i=0;i<field.length;i++)assert.ok(Math.abs(precise[i]/65535-field[i]/255)<=1/255);
});

test('empty and filled masks stay finite and invalid field dimensions fail safely',()=>{
    assert.ok(signedLetterField(new Uint8Array(12),4,3).every(value=>value===255));
    assert.ok(signedLetterField(new Uint8Array(12).fill(1),4,3).every(value=>value===0));
    for(const args of [[new Uint8Array(12),3,3],[new Uint8Array(0),0,0],[new Uint8Array(12),4,3,1.6,0]])assert.throws(()=>signedLetterField(...args));
});
