// Share simultaneous identical Supabase reads without introducing stale caches.
export function createInFlightCoalescer(){
 const inFlight=new Map();
 return (key,run)=>{
  if(inFlight.has(key))return inFlight.get(key);
  const pending=Promise.resolve().then(run);
  inFlight.set(key,pending);
  const clear=()=>{if(inFlight.get(key)===pending)inFlight.delete(key)};
  // A failed read must be retried on the next poll, not cached forever.
  pending.then(clear,clear);
  return pending;
 };
}
