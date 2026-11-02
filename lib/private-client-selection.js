// Keep the client detail/actions synchronized with the visible directory row.
// Filtering may hide the previously selected client; in that case the first
// visible result becomes the actual selection, not only a visual fallback.
export function visiblePrivateClientSelection(visibleClients,currentId){
 if(visibleClients.some(client=>client.id===currentId))return currentId;
 return visibleClients[0]?.id||null;
}
