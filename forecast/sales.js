(() => {
  const tab = document.createElement('button');
  tab.className='tab'; tab.dataset.view='sales'; tab.setAttribute('aria-selected','false'); tab.textContent='Penjualan harian';
  document.querySelector('.tabs').append(tab);
  const section=document.createElement('section'); section.id='view-sales'; section.className='view'; section.hidden=true;
  section.innerHTML='<div class="section-heading"><div><h2>Pembayaran ESB per outlet</h2><p>Jadwal penarikan belum diatur.</p></div></div><form id="sales-read" class="filters"><label>Tanggal penjualan<input name="date" type="date" required></label><button class="button primary">Lihat data tersimpan</button></form><p id="sales-status" role="status"></p><div id="sales-results" style="overflow-x:auto"></div>';
  document.querySelector('main').insertBefore(section,document.querySelector('footer'));
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.view').forEach(v=>v.hidden=v!==section);
    document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===tab);b.setAttribute('aria-selected',String(b===tab));});
  });
  const form=section.querySelector('form'), status=section.querySelector('#sales-status'),results=section.querySelector('#sales-results');
  const yesterday=new Date(Date.now()-86400000);
  form.elements.date.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(yesterday);
  const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
  form.addEventListener('submit',async e=>{
    e.preventDefault(); results.replaceChildren(); status.textContent='Memuat data…';form.querySelector('button').disabled=true;
    try {
      const api=window.ForecastAccess;
      if (!api?.readRadarDaily) {status.textContent='Koneksi akun sedang dimuat. Coba lagi sebentar.';return;}
      const date=form.elements.date.value, data=await api.readRadarDaily(date);
      if (!data) {status.textContent='Belum ada laporan tersimpan untuk tanggal ini.';return;}
      if (data.date!==date || data.metric!=='paymentAmount' || !Array.isArray(data.rows)) throw Error('Format data belum sesuai.');
      status.textContent=data.rows.length+' outlet · diperbarui '+new Date(data.syncedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB';
      const table=document.createElement('table'); table.style.cssText='width:100%;border-collapse:collapse;text-align:left';
      const head=table.createTHead().insertRow(); ['Outlet','Total pembayaran','Jumlah pembayaran'].forEach(label=>{const th=document.createElement('th');th.textContent=label;th.style.padding='12px';head.append(th);});
      const body=table.createTBody();
      data.rows.forEach(r=>{const row=body.insertRow();[r.outlet,money(r.totalPayment),String(r.paymentCount)].forEach(v=>{const cell=row.insertCell();cell.textContent=v;cell.style.cssText='padding:12px;border-top:1px solid #e5dac8';});});
      results.append(table);
      const note=document.createElement('p');note.className='fineprint';note.textContent='Jumlah pembayaran dapat berbeda dari jumlah transaksi. Rekap pembayaran masih perlu dicocokkan dengan omzet.'; results.append(note);
    } catch (error) {status.textContent=error.code==='auth-required'?'Klik Masuk untuk membaca laporan penjualan.':'Data belum dapat dibaca. Periksa login dan izin akses Forecast.';}
    finally {form.querySelector('button').disabled=false;}
  });
})();
