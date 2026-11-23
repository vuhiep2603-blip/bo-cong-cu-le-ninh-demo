export type ImageProfile = 'original'|'contrast'|'adaptive';

function intensity(data:ArrayLike<number>,i:number) {
  return .299*data[i]+.587*data[i+1]+.114*data[i+2];
}

/** A conservative projection score for small rotations on sampled dark pixels. */
export function estimateSkew(data:Uint8ClampedArray,width:number,height:number) {
  const points:[number,number][]=[];
  const stride=Math.max(2,Math.floor(Math.sqrt(width*height/36000)));
  for(let y=2;y<height-2;y+=stride) for(let x=2;x<width-2;x+=stride){
    if(intensity(data,(y*width+x)*4)<105)points.push([x-width/2,y]);
  }
  if(points.length<160)return 0;
  const score=(degrees:number)=>{
    const slope=Math.tan(degrees*Math.PI/180);
    const bands=new Uint32Array(Math.ceil(height/3)+12);
    for (const [x,y] of points){
      const band=Math.floor((y+x*slope)/3)+6;
      if(band>=0&&band<bands.length)bands[band]++;
    }
    return bands.reduce((sum,n)=>sum+n*n,0);
  };
  const initial=score(0);
  let best=0,max=initial;
  for(let step=-8;step<=8;step++){
    const angle=step*.5;
    const value=score(angle);
    if(value>max){best=angle;max=value;}
  }
  return max>initial*1.13?best:0;
}

export function prepareOcrImage(image:ImageData,profile:ImageProfile) {
  if(profile==='original')return;
  const {data,width,height}=image;
  if(profile==='contrast'){
    for(let i=0;i<data.length;i+=4){
      const gray=intensity(data,i);
      const value=Math.max(0,Math.min(255,(gray-110)*1.6+110));
      data[i]=data[i+1]=data[i+2]=value;
    }
    return;
  }
  const gray=new Uint8Array(width*height);
  for(let i=0;i<gray.length;i++){
    const at=i*4;
    // Red stamp ink is brightened in THIS candidate only. The original image remains available.
    gray[i]=data[at]>data[at+1]+36&&data[at]>data[at+2]+36
      ? Math.max(intensity(data,at),data[at]) : intensity(data,at);
  }
  const clean=new Uint8Array(gray);
  // Remove isolated dark dots while preserving connected strokes.
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(gray[i]<120&&gray[i-1]>190&&gray[i+1]>190&&gray[i-width]>190&&gray[i+width]>190)clean[i]=255;
  }
  const stride=width+1;
  const integral=new Float64Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let sum=0;
    for(let x=0;x<width;x++){
      sum+=clean[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;
    }
  }
  const radius=Math.max(7,Math.min(25,Math.round(width/50)));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const l=Math.max(0,x-radius),r=Math.min(width,x+radius+1);
    const t=Math.max(0,y-radius),b=Math.min(height,y+radius+1);
    const mean=(integral[b*stride+r]-integral[b*stride+l]-integral[t*stride+r]+integral[t*stride+l])/((r-l)*(b-t));
    const value=clean[y*width+x]<Math.min(235,mean-12)?0:255;
    const i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=value;
  }
}
