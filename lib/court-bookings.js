// Padel & basketball price suggestions, in integer USD cents. Pickleball stays manual.
export const COURT_LABELS=Object.freeze(['C1','C2','C3']);
const validClock=x=>typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);
export function bookingMinutes(start,end){
 if(!validClock(start)||!validClock(end))throw Error('Choose valid court start and end times.');
 const toMinutes=x=>Number(x.slice(0,2))*60+Number(x.slice(3));
 const duration=toMinutes(end)-toMinutes(start);
 if(duration<=0)throw Error('End time must be later than start time on the same day.');
 if(duration>720)throw Error('Court bookings cannot exceed 12 hours.');
 return duration;
}
const rates={padel_courts:{60:2500,90:3200,120:4000},basketball_courts:{60:2000,90:3000,120:4000}};
export function courtPriceCents(category,start,end){
 return rates[category]?.[bookingMinutes(start,end)]??null;
}
export function parseCourtBooking(data){
 const court=String(data.court_number||'').trim(),start=String(data.booking_start_time||'').trim(),
  end=String(data.booking_end_time||'').trim();
 if(!court&&!start&&!end)return null; // compatibility for previously recorded entries
 if(!COURT_LABELS.includes(court))throw Error('Choose court C1, C2 or C3.');
 bookingMinutes(start,end);
 return {court_number:court,booking_start_time:start,booking_end_time:end};
}
