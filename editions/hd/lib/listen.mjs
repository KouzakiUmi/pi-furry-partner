// A local listening gesture has no model/tool side effects or extra timers.
export const LISTEN_DURATION_MS = 1800;

export function withListenFrames(sheet, asset) {
  if (!asset || asset.width !== sheet.width || asset.height !== sheet.height ||
      !Array.isArray(asset.frames) || asset.frames.length !== 2 ||
      asset.frames[0]?.id !== "listen" || asset.frames[1]?.id !== "listen-blink") return sheet;
  const count=sheet.width*sheet.height;
  for(const frame of asset.frames) if(!Array.isArray(frame.pixels)||frame.pixels.length!==count||
    frame.pixels.some((color)=>!Number.isInteger(color)||color<0||color>=sheet.palette.length)) return sheet;
  if(sheet.ids.listen!==undefined||sheet.ids["listen-blink"]!==undefined)return sheet;
  const ids={...sheet.ids};for(const [offset,frame]of asset.frames.entries())ids[frame.id]=sheet.frames.length+offset;
  return {...sheet,frames:[...sheet.frames,...asset.frames],ids,motion:{...sheet.motion,listen:asset.motion}};
}
