// ETB_HALF_UP_LINE_V1: multiply exact decimal quantity × exact asking price,
// round each contribution half-up to 2 decimal places, then sum integer cents.
// JSON monetary totals are fixed-precision strings, never binary float sums.
const fail = () => Object.assign(new Error('Expected a finite non-negative decimal'), { status: 400 });
const decimal = value => {
  if (!['string','number'].includes(typeof value)) throw fail();
  const text=String(value).trim();
  if (text.length>160) throw fail();
  const match=/^\+?(\d+(?:\.\d*)?|\.\d+)(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw fail();
  const exponent=Number(match[2] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent)>100) throw fail();
  const [whole,fraction='']=match[1].split('.');
  let coefficient=BigInt((whole || '0')+fraction), scale=fraction.length-exponent;
  if (scale<0) {coefficient*=10n**BigInt(-scale);scale=0;}
  return {coefficient,scale};
};
const positiveDecimal = value => {
  if (decimal(value).coefficient<=0n) throw fail();
  return String(value);
};
const lineMinor = (quantity,price) => {
  const q=decimal(quantity),p=decimal(price);
  const numerator=q.coefficient*p.coefficient*100n, denominator=10n**BigInt(q.scale+p.scale);
  return (numerator+denominator/2n)/denominator;
};
const formatMinor = minor => {
  const absolute = minor < 0n ? -minor : minor;
  return `${minor < 0n ? '-' : ''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
};
const sumMoney = values => formatMinor(values.reduce((sum,v)=>sum+lineMinor(1,v ?? 0),0n));
// Exact price ceiling comparison across compatible mass units.
const withinPrice = (price,requestUnitMass,listingUnitMass,maxPrice) => {
  const p=decimal(price),m=decimal(maxPrice);
  return p.coefficient*BigInt(requestUnitMass)*10n**BigInt(m.scale)<=
    m.coefficient*BigInt(listingUnitMass)*10n**BigInt(p.scale);
};
const sameDecimal = (left,right) => {
  const a=decimal(left),b=decimal(right);
  return a.coefficient*10n**BigInt(b.scale)===b.coefficient*10n**BigInt(a.scale);
};
module.exports={decimal,positiveDecimal,lineMinor,formatMinor,sumMoney,withinPrice,sameDecimal,policy:'ETB_HALF_UP_LINE_V1'};
