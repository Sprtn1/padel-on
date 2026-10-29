// Padel & basketball price suggestions, in integer USD cents. Pickleball stays manual.
export const COURT_LABELS=Object.freeze(['C1','C2','C3']);
export const COURT_DURATION_OPTIONS=Object.freeze([30,45,60,75,90,105,120,150,180,240,300,360,480,600,720]);
const validClock=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const toMinutes=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
const validDuration=value=>Number.isInteger(Number(value))&&Number(value)>=15&&Number(value)<=720&&Number(value)%15===0;
export function bookingMinutes(start,end){
 if(!validClock(start)||!validClock(end))throw Error('Choose valid court start and end times.');
 let duration=toMinutes(end)-toMinutes(start);
 if(duration<=0)duration+=24*60;
 if(duration>720)throw Error('Court bookings cannot exceed 12 hours.');
 return duration;
}
export function bookingEndTime(start,duration){
 if(!validClock(start))throw Error('Choose a valid court start time.');
 if(!validDuration(duration))throw Error('Choose a duration in 15-minute steps, up to 12 hours.');
 const total=(toMinutes(start)+Number(duration))%(24*60);
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
export function bookingCrossesMidnight(start,end){
 if(!validClock(start)||!validClock(end))return false;
 return toMinutes(end)<=toMinutes(start);
}
const rates={padel_courts:{60:2500,90:3200,120:4000},basketball_courts:{60:2000,90:3000,120:4000}};
export function courtPriceCents(category,start,end){
 return rates[category]?.[bookingMinutes(start,end)]??null;
}
export function parseCourtBooking(category,data){
 const court=String(data.court_number||'').trim(),start=String(data.booking_start_time||'').trim(),
  duration=String(data.booking_duration_minutes||'').trim();
 const end=duration?bookingEndTime(start,duration):String(data.booking_end_time||'').trim();
 if(!court&&!start&&!end&&!duration)return null; // compatibility for previously recorded entries
 if(category==='padel_courts'&&!COURT_LABELS.includes(court))throw Error('Choose court C1, C2 or C3.');
 if(category!=='padel_courts'&&court)throw Error('Court selection is only available for padel.');
 bookingMinutes(start,end);
 return {court_number:category==='padel_courts'?court:null,booking_start_time:start,booking_end_time:end};
}
