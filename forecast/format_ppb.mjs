// A positive native value must never be formatted as zero.
export function formatPpb(value){
 if(!Number.isFinite(value)||value<0)throw Error('Invalid concentration for display');
 if(value===0)return '0';
 if(value<.001){const [mantissa,exponent]=value.toExponential(2).split('e');return `${mantissa} × 10<sup>${Number(exponent)}</sup>`;}
 return Number(value.toPrecision(3)).toString();
}
