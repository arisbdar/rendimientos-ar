let config = {};

document.addEventListener('DOMContentLoaded', loadConfig);

async function loadConfig() {
  config = await fetch('/api/config').then(r => r.json());
  renderAll();
}

function renderAll() {
  renderGarantizados();
  renderEspeciales();
  renderFCIs();
}

function renderGarantizados() {
  const tbody = document.getElementById('table-garantizados');
  const items = config.garantizados;
  document.getElementById('count-garantizados').textContent = items.filter(i => i.activo).length + '/' + items.length;

  tbody.innerHTML = items.map(item => `
    <tr class="${item.activo ? '' : 'inactive'}">
      <td>
        <label class="toggle">
          <input type="checkbox" ${item.activo ? 'checked' : ''} onchange="toggleItem('garantizados','${item.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td><strong>${item.nombre}</strong></td>
      <td>${item.tipo}</td>
      <td><strong>${item.tna.toFixed(2)}%</strong></td>
      <td>${item.limite}</td>
      <td>${item.vigente_desde}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('garantizados','${item.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function renderEspeciales() {
  const tbody = document.getElementById('table-especiales');
  const items = config.especiales;
  document.getElementById('count-especiales').textContent = items.filter(i => i.activo).length + '/' + items.length;

  tbody.innerHTML = items.map(item => `
    <tr class="${item.activo ? '' : 'inactive'}">
      <td>
        <label class="toggle">
          <input type="checkbox" ${item.activo ? 'checked' : ''} onchange="toggleItem('especiales','${item.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td><strong>${item.nombre}</strong></td>
      <td><strong>${item.tna.toFixed(2)}%</strong></td>
      <td>${item.limite}</td>
      <td style="max-width:200px;font-size:0.8rem">${item.descripcion || '—'}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('especiales','${item.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function renderFCIs() {
  const tbody = document.getElementById('table-fcis');
  const items = config.fcis;
  document.getElementById('count-fcis').textContent = items.filter(i => i.activo).length + '/' + items.length;

  tbody.innerHTML = items.map(item => `
    <tr class="${item.activo ? '' : 'inactive'}">
      <td>
        <label class="toggle">
          <input type="checkbox" ${item.activo ? 'checked' : ''} onchange="toggleItem('fcis','${item.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td><strong>${item.nombre}</strong></td>
      <td>${item.entidad}</td>
      <td>${item.categoria}</td>
      <td>${item.fondo_id}</td>
      <td>${item.clase_id}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('fcis','${item.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function toggleItem(section, id, active) {
  await fetch(`/api/config/${section}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo: active })
  });
  await loadConfig();
}

async function deleteItem(section, id) {
  if (!confirm('¿Eliminar este item?')) return;
  await fetch(`/api/config/${section}/${id}`, { method: 'DELETE' });
  await loadConfig();
}

// --- Modal ---

const formFields = {
  garantizados: [
    { key: 'id', label: 'ID (slug)', type: 'text', required: true },
    { key: 'nombre', label: 'Nombre', type: 'text', required: true },
    { key: 'tipo', label: 'Tipo', type: 'select', options: ['Cuenta Remunerada', 'Billetera'] },
    { key: 'tna', label: 'TNA (%)', type: 'number', required: true },
    { key: 'limite', label: 'Límite (ej: $1 M, Sin Límites)', type: 'text', required: true },
    { key: 'vigente_desde', label: 'Vigente desde (DD/MM/YYYY)', type: 'text', required: true },
    { key: 'logo', label: 'Logo (2 letras)', type: 'text', required: true },
    { key: 'logo_bg', label: 'Color logo (hex)', type: 'text', value: '#6c63ff' }
  ],
  especiales: [
    { key: 'id', label: 'ID (slug)', type: 'text', required: true },
    { key: 'nombre', label: 'Nombre', type: 'text', required: true },
    { key: 'descripcion', label: 'Descripción / Condición', type: 'textarea' },
    { key: 'tipo', label: 'Tipo', type: 'select', options: ['Cuenta Remunerada', 'Billetera'] },
    { key: 'tna', label: 'TNA (%)', type: 'number', required: true },
    { key: 'limite', label: 'Límite', type: 'text', required: true },
    { key: 'vigente_desde', label: 'Vigente desde (DD/MM/YYYY)', type: 'text', required: true },
    { key: 'logo', label: 'Logo (2 letras)', type: 'text', required: true },
    { key: 'logo_bg', label: 'Color logo (hex)', type: 'text', value: '#6c63ff' }
  ],
  fcis: [
    { key: 'id', label: 'ID (slug)', type: 'text', required: true },
    { key: 'nombre', label: 'Nombre del Fondo', type: 'text', required: true },
    { key: 'entidad', label: 'Entidad / Plataforma', type: 'text', required: true },
    { key: 'categoria', label: 'Categoría', type: 'select', options: ['Money Market', 'Renta Fija', 'Renta Variable', 'Renta Mixta'] },
    { key: 'fondo_id', label: 'CAFCI Fondo ID', type: 'number', required: true },
    { key: 'clase_id', label: 'CAFCI Clase ID', type: 'number', required: true }
  ]
};

let currentSection = '';

function openModal(section) {
  currentSection = section;
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('modal-form');
  const title = document.getElementById('modal-title');

  const labels = { garantizados: 'cuenta garantizada', especiales: 'cuenta especial', fcis: 'FCI' };
  title.textContent = `Agregar ${labels[section]}`;

  const fields = formFields[section];
  let html = fields.map(f => {
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o}">${o}</option>`).join('');
      return `<div class="form-group"><label>${f.label}</label><select name="${f.key}">${opts}</select></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-group"><label>${f.label}</label><textarea name="${f.key}"></textarea></div>`;
    }
    const val = f.value ? ` value="${f.value}"` : '';
    const req = f.required ? ' required' : '';
    const step = f.type === 'number' ? ' step="any"' : '';
    return `<div class="form-group"><label>${f.label}</label><input type="${f.type}" name="${f.key}"${val}${req}${step}></div>`;
  }).join('');

  html += `
    <div class="form-actions">
      <button type="button" class="btn btn-cancel" onclick="closeModal()">Cancelar</button>
      <button type="submit" class="btn btn-primary">Guardar</button>
    </div>
  `;

  form.innerHTML = html;
  form.onsubmit = handleSubmit;
  overlay.classList.add('show');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('show');
}

async function handleSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  // Convert number fields
  if (data.tna) data.tna = parseFloat(data.tna);
  if (data.fondo_id) data.fondo_id = parseInt(data.fondo_id);
  if (data.clase_id) data.clase_id = parseInt(data.clase_id);

  data.activo = true;

  await fetch(`/api/config/${currentSection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  closeModal();
  await loadConfig();
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
