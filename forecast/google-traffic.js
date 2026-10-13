'use strict';
(()=>{
 const $=s=>document.querySelector(s);let googleMap,trafficLayer,point,loading;
 const selected=()=>window.OUTLET_DATA.outlets.find(o=>o.id===$('#traffic-outlet').value);
 const message=s=>$('#google-traffic-message').textContent=s;
 function focus(){const o=selected();if(!o)return;$('#google-traffic-outlet').href=`https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lon}`;if(googleMap){const center={lat:o.lat,lng:o.lon};googleMap.setCenter(center);point.setCenter(center);}}
 function load(key){
  if(window.google?.maps?.importLibrary)return Promise.resolve();
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(Error('Google Maps belum merespons. Coba muat ulang halaman.'));},20000);
   window.radarGoogleMapsReady=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Error('Google Maps gagal dimuat. Periksa koneksi internet.'));};
   script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&loading=async&callback=radarGoogleMapsReady&v=weekly&language=id&region=ID';script.async=true;document.head.appendChild(script);
  }).catch(e=>{loading=null;throw e;});return loading;
 }
 window.gm_authFailure=()=>{message('Akses Google Maps gagal. Periksa API key, pembatasan domain, dan billing.');$('#google-traffic-map').hidden=true;$('#google-traffic-load').disabled=false;};
 $('#google-traffic-load').onclick=async()=>{
  const key=String(window.RADAR_GOOGLE_MAPS_KEY||'').trim();if(!key){message('Belum terhubung. Aktifkan Google Maps Platform untuk menampilkan trafik di sini.');return;}
  const button=$('#google-traffic-load');button.disabled=true;message('Memuat Google Maps…');
  try{await load(key);const {Map,TrafficLayer,Circle}=await google.maps.importLibrary('maps');$('#google-traffic-map').hidden=false;
   if(!googleMap){const o=selected();googleMap=new Map($('#google-traffic-map'),{center:{lat:o.lat,lng:o.lon},zoom:15,mapTypeControl:false,streetViewControl:false,fullscreenControl:true});point=new Circle({map:googleMap,center:{lat:o.lat,lng:o.lon},radius:25,fillColor:'#5a3017',fillOpacity:1,strokeColor:'#ffffff',strokeWeight:2});trafficLayer=new TrafficLayer({autoRefresh:true});trafficLayer.setMap(googleMap);}
   focus();message('Warna menunjukkan kondisi lalu lintas di jalan yang tercakup Google.');button.textContent='Fokus outlet';
  }catch(e){message(e.message);$('#google-traffic-map').hidden=true;}finally{button.disabled=false;}
 };
 $('#traffic-outlet').addEventListener('change',focus);focus();
})();
