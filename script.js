(() => {

'use strict';

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const STORAGE_KEYS = {
    students:'refeitorio_students',
    logs:'refeitorio_logs'
};

const RIGHTS = {
    'Ensino Médio NEM': [
        'Lanche da Manhã',
        'Almoço'
    ],

    'Ensino Médio EMTI': [
        'Lanche da Manhã',
        'Almoço',
        'Lanche da Tarde'
    ],

    'Ensino Fundamental': [
        'Almoço'
    ]
};

const APP = {
    scanner:null,
    scannerStarting:false,
    scannerLocked:false,
    chart:null,
    validatingStudent:null,
    lastScan:0,
    cooldown:2500
};

/* =====================================================
   UTILIDADES
===================================================== */

const $ = selector => document.querySelector(selector);

const todayBR = () =>
    new Date().toLocaleDateString('pt-BR');

const nowBR = () =>
    new Date().toLocaleTimeString('pt-BR');

const escapeHTML = value => {
    if(!value) return '';

    return String(value)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;')
        .replace(/'/g,'&#039;');
};

const normalize = text =>
    String(text)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'')
        .toLowerCase();

const vibrate = pattern => {
    if(navigator.vibrate){
        navigator.vibrate(pattern);
    }
};

const generateFileName = (prefix,ext) => {
    const date = new Date().toISOString().split('T')[0];
    return `${prefix}_${date}.${ext}`;
};

const uuid = () => crypto.randomUUID();

/* =====================================================
   DATABASE
===================================================== */

class DB {

    static load(key){
        try{
            return JSON.parse(localStorage.getItem(key)) || [];
        }catch{
            return [];
        }
    }

    static save(key,value){
        localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    }

}

let students = DB.load(STORAGE_KEYS.students);
let logs = DB.load(STORAGE_KEYS.logs);

/* =====================================================
   FEEDBACK
===================================================== */

let feedbackTimeout;

function feedback(message,type='info'){

    const box = $('#feedback');

    const colors = {
        success:'#E8F5E9',
        danger:'#FFEBEE',
        warning:'#FFF8E1',
        info:'#FAFAFA'
    };

    box.innerHTML = message;
    box.style.background = colors[type];

    clearTimeout(feedbackTimeout);

    feedbackTimeout = setTimeout(() => {

        box.innerHTML =
            'Aguardando leitura do QR Code...';

        box.style.background = '#FAFAFA';

    },3500);
}

/* =====================================================
   NAVEGAÇÃO
===================================================== */

document.querySelectorAll('.nav-btn').forEach(btn => {

    btn.addEventListener('click', () => {

        document
            .querySelectorAll('.nav-btn')
            .forEach(b => b.classList.remove('active'));

        btn.classList.add('active');

        document
            .querySelectorAll('.section')
            .forEach(s => s.classList.remove('active'));

        $('#' + btn.dataset.tab)
            .classList.add('active');

        cancelValidation();

        if(btn.dataset.tab === 'scanner'){
            startCamera();
        }else{
            stopCamera();
        }

        if(btn.dataset.tab === 'dashboard'){
            renderDashboard();
        }

    });

});

/* =====================================================
   SCANNER
===================================================== */

async function startCamera(){

    if(APP.scanner || APP.scannerStarting){
        return;
    }

    APP.scannerStarting = true;

    try{

        APP.scanner =
            new Html5Qrcode('reader');

        await APP.scanner.start(
            { facingMode:'environment' },
            {
                fps:10,
                qrbox:{
                    width:250,
                    height:250
                }
            },
            onScanSuccess
        );

    }catch(error){

        console.error(error);

        $('#reader').innerHTML = `
            <div
                style="
                    padding:40px;
                    text-align:center;
                    color:#D32F2F;
                    background:#FFF;
                "
            >
                ❌ Não foi possível acessar a câmera.
                <br><br>
                Utilize a busca manual.
            </div>
        `;

    }finally{
        APP.scannerStarting = false;
    }

}

async function stopCamera(){

    if(!APP.scanner){
        return;
    }

    try{

        await APP.scanner.stop();
        await APP.scanner.clear();

    }catch(e){
        console.warn(e);
    }

    APP.scanner = null;
}

function onScanSuccess(decodedText){

    const now = Date.now();

    if(APP.scannerLocked) return;

    if(now - APP.lastScan < APP.cooldown){
        return;
    }

    APP.lastScan = now;
    APP.scannerLocked = true;

    setTimeout(() => {
        APP.scannerLocked = false;
    },APP.cooldown);

    processStudent(decodedText);
}

/* =====================================================
   PROCESSAMENTO
===================================================== */

function processStudent(hash){

    if(APP.validatingStudent){
        return;
    }

    const safeHash =
        escapeHTML(hash.trim());

    const student =
        students.find(s =>
            s.hash === safeHash ||
            s.id === safeHash
        );

    if(!student){

        feedback(`
            <span style="font-size:24px;">
                ❌ NÃO ENCONTRADO
            </span>
            <br>
            QR Code inválido.
        `,'danger');

        vibrate([200,100,200]);

        return;
    }

    openValidation(student);
}

/* =====================================================
   VALIDAÇÃO VISUAL
===================================================== */

function openValidation(student){

    APP.validatingStudent = student;

    $('#preview-name').textContent =
        student.name;

    $('#preview-id').textContent =
        `Matrícula: ${student.id}`;

    $('#preview-segment').textContent =
        student.segment;

    const badge =
        $('#preview-segment');

    badge.className =
        'preview-segment';

    if(student.segment.includes('NEM')){
        badge.classList.add('badge-green');
    }
    else if(student.segment.includes('EMTI')){
        badge.classList.add('badge-orange');
    }
    else{
        badge.classList.add('badge-blue');
    }

    $('#reader-container').style.display =
        'none';

    $('#validation-area').style.display =
        'block';

    vibrate([100]);
}

function cancelValidation(){

    APP.validatingStudent = null;

    $('#validation-area').style.display =
        'none';

    $('#reader-container').style.display =
        'block';
}

$('#confirm-btn').addEventListener(
    'click',
    confirmMeal
);

$('#cancel-btn').addEventListener(
    'click',
    cancelValidation
);

function confirmMeal(){

    if(!APP.validatingStudent){
        return;
    }

    const student =
        APP.validatingStudent;

    cancelValidation();

    const meal =
        $('#meal-select').value;

    const today =
        todayBR();

    const allowed =
        RIGHTS[student.segment]
        ?.includes(meal);

    if(!allowed){

        feedback(`
            ❌
            <strong>
                ${student.name}
            </strong>
            não possui acesso ao
            <strong>
                ${meal}
            </strong>.
        `,'danger');

        vibrate([300]);

        return;
    }

    const duplicate =
        logs.find(log =>
            log.studentId === student.id &&
            log.date === today &&
            log.meal === meal
        );

    if(duplicate){

        feedback(`
            ⚠️
            <strong>
                ${student.name}
            </strong>
            já utilizou:
            <strong>
                ${meal}
            </strong>.
        `,'warning');

        vibrate([100,50,100]);

        return;
    }

    const entry = {
        id:uuid(),
        studentId:student.id,
        studentName:student.name,
        segment:student.segment,
        meal,
        date:today,
        hour:nowBR()
    };

    logs.push(entry);

    DB.save(
        STORAGE_KEYS.logs,
        logs
    );

    feedback(`
        <span style="font-size:24px;">
            ✅ LIBERADO
        </span>
        <br>
        ${student.name}
    `,'success');

    vibrate([100]);

    renderDashboard();
}

/* =====================================================
   CADASTRO
===================================================== */

$('#save-student-btn')
.addEventListener('click',saveStudent);

function saveStudent(){

    const name =
        $('#student-name')
        .value
        .trim();

    const id =
        $('#student-id')
        .value
        .trim();

    const segment =
        $('#student-segment')
        .value;

    if(name.length < 3 ||
       !id ||
       !segment){

        alert(
            '⚠️ Preencha todos os campos.'
        );

        return;
    }

    const exists =
        students.some(s => s.id === id);

    if(exists){

        alert(
            '❌ Matrícula já cadastrada.'
        );

        return;
    }

    students.push({
        id:escapeHTML(id),
        name:escapeHTML(name),
        segment:escapeHTML(segment),
        hash:escapeHTML(id)
    });

    DB.save(
        STORAGE_KEYS.students,
        students
    );

    $('#student-name').value = '';
    $('#student-id').value = '';
    $('#student-segment').value = '';

    renderStudents();

    alert('✅ Aluno cadastrado com sucesso!.');
}

/* =====================================================
   RENDER STUDENTS
===================================================== */

function renderStudents(){

    const container =
        $('#student-list');

    container.innerHTML = '';

    $('#student-count').textContent =
        `${students.length} alunos`;

    $('#stat-students').textContent =
        students.length;

    if(!students.length){

        container.innerHTML = `
            <div
                style="
                    padding:30px;
                    text-align:center;
                    color:#607D8B;
                "
            >
                Nenhum aluno cadastrado.
            </div>
        `;

        return;
    }

    const fragment =
        document.createDocumentFragment();

    students.forEach(student => {

        const row =
            document.createElement('div');

        row.className = 'student-row';

        const left =
            document.createElement('div');

        left.innerHTML = `
            <strong>
                ${student.name}
            </strong>

            <div style="margin-top:4px;">
                Matrícula:
                ${student.id}
            </div>
        `;

        const badge =
            document.createElement('span');

        badge.className = 'badge';

        if(student.segment.includes('NEM')){
            badge.classList.add('badge-green');
        }
        else if(student.segment.includes('EMTI')){
            badge.classList.add('badge-orange');
        }
        else{
            badge.classList.add('badge-blue');
        }

        badge.textContent =
            student.segment;

        left.appendChild(badge);

        const right =
            document.createElement('button');

        right.className =
            'btn btn-danger';

        right.style.width = '120px';

        right.textContent =
            'Excluir';

        right.addEventListener('click', () => {

            const confirmDelete =
                confirm(
                    '⚠️ Deseja excluir este aluno?'
                );

            if(!confirmDelete){
                return;
            }

            students =
                students.filter(s =>
                    s.id !== student.id
                );

            DB.save(
                STORAGE_KEYS.students,
                students
            );

            renderStudents();
            renderDashboard();

        });

        row.appendChild(left);
        row.appendChild(right);

        fragment.appendChild(row);

    });

    container.appendChild(fragment);
}

/* =====================================================
   BUSCA MANUAL
===================================================== */

$('#manual-search')
.addEventListener('input',manualSearch);

function manualSearch(){

    const term =
        normalize(
            $('#manual-search').value
        );

    const container =
        $('#manual-results');

    container.innerHTML = '';

    if(term.length < 2){
        return;
    }

    const results =
        students
            .filter(student =>
                normalize(student.name)
                    .includes(term)
                ||
                normalize(student.id)
                    .includes(term)
            )
            .slice(0,10);

    results.forEach(student => {

        const row =
            document.createElement('div');

        row.className =
            'student-row';

        row.innerHTML = `
            <div>
                <strong>
                    ${student.name}
                </strong>

                <div style="margin-top:4px;">
                    Matrícula:
                    ${student.id}
                </div>
            </div>
        `;

        const btn =
            document.createElement('button');

        btn.className =
            'btn btn-primary';

        btn.style.width = '160px';

        btn.textContent =
            'Visualizar';

        btn.addEventListener('click', () => {
            openValidation(student);
        });

        row.appendChild(btn);

        container.appendChild(row);

    });

}

/* =====================================================
   IMPORTAÇÃO
===================================================== */

$('#import-btn')
.addEventListener(
    'click',
    importSpreadsheet
);

function importSpreadsheet(){

    const file =
        $('#import-file').files[0];

    if(!file){
        alert('Selecione um arquivo.');
        return;
    }

    const reader =
        new FileReader();

    reader.onload = e => {

        try{

            const data =
                new Uint8Array(
                    e.target.result
                );

            const workbook =
                XLSX.read(data,{
                    type:'array'
                });

            const sheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                ];

            const rows =
                XLSX.utils.sheet_to_json(
                    sheet,
                    { header:1 }
                );

            let inserted = 0;
            let ignored = 0;

            const existing =
                new Set(
                    students.map(s => s.id)
                );

            for(let i=1; i<rows.length; i++){

                const row = rows[i];

                if(!row || row.length < 3){
                    continue;
                }

                const name =
                    String(row[0] || '').trim();

                const id =
                    String(row[1] || '').trim();

                const segment =
                    String(row[2] || '').trim();

                if(!name || !id || !segment){
                    ignored++;
                    continue;
                }

                if(existing.has(id)){
                    ignored++;
                    continue;
                }

                students.push({
                    id:escapeHTML(id),
                    name:escapeHTML(name),
                    segment:escapeHTML(segment),
                    hash:escapeHTML(id)
                });

                existing.add(id);

                inserted++;

            }

            DB.save(
                STORAGE_KEYS.students,
                students
            );

            renderStudents();

            alert(`Importação Concluída!\n\n✅ ${inserted} alunos adicionados.\n⚠️ ${ignored} ignorados (matrículas repetidas).`);

        }catch(error){

            console.error(error);

            alert('⚠️ Erro ao importar arquivo. \nVerifique se as colunas estão corretas (Nome, Matrícula, Segmento).');

        }

    };

    reader.readAsArrayBuffer(file);
}

/* =====================================================
   DASHBOARD
===================================================== */

function renderDashboard(){

    $('#stat-students').textContent =
        students.length;

    $('#stat-logs').textContent =
        logs.length;

    const today =
        todayBR();

    const todayCount =
        logs.filter(log =>
            log.date === today
        ).length;

    $('#stat-today').textContent =
        todayCount;

    const grouped = {};

    logs.forEach(log => {

        grouped[log.date] =
            (grouped[log.date] || 0) + 1;

    });

    const labels =
        Object.keys(grouped)
        .slice(-7);

    const values =
        labels.map(label =>
            grouped[label]
        );

    const average =
        values.length
            ? Math.round(
                values.reduce((a,b)=>a+b,0)
                / values.length
            )
            : 0;

    $('#stat-average').textContent =
        average;

    renderForecast(average);

    renderChart(labels,values);
}

/* =====================================================
   FORECAST
===================================================== */

function renderForecast(avg){

    const suggested =
        Math.ceil(avg * 1.1);

    $('#forecast-box').innerHTML = `
        <div class="info-box info-blue">
            📈 Média diária:
            <strong>${avg}</strong>
            refeições.

            <br><br>

            🍛 Sugestão ideal de preparo:
            <strong>${suggested}</strong>
            refeições.
        </div>
    `;
}

/* =====================================================
   DESPERDÍCIO
===================================================== */

$('#prepared-input')
.addEventListener(
    'input',
    analyzeWaste
);

function analyzeWaste(){

    const prepared =
        Number(
            $('#prepared-input').value
        );

    if(!prepared){

        $('#waste-analysis').innerHTML = '';

        return;
    }

    const grouped = {};

    logs.forEach(log => {

        grouped[log.date] =
            (grouped[log.date] || 0) + 1;

    });

    const values =
        Object.values(grouped);

    if(!values.length){
        return;
    }

    const avg =
        values.reduce((a,b)=>a+b,0)
        / values.length;

    if(prepared > avg){

        $('#waste-analysis').innerHTML = `
            <div class="info-box info-red">
                ⚠️ Possível sobra aproximada:
                <strong>
                    ${Math.round(prepared - avg)}
                </strong>
                refeições.
            </div>
        `;

    }else{

        $('#waste-analysis').innerHTML = `
            <div class="info-box info-green">
                ✅ Produção adequada.
            </div>
        `;

    }

}

/* =====================================================
   GRÁFICO (CORRIGIDO)
===================================================== */

function renderChart(labels,values){

    const canvas =
        $('#consumption-chart');

    if(APP.chart){

        APP.chart.destroy();
        APP.chart = null;

    }

    APP.chart = new Chart(
        canvas,
        {
            type:'bar',

            data:{
                labels,
                datasets:[{
                    label:'Consumo diário',
                    data:values,
                    borderRadius:10
                }]
            },

            options:{

                responsive:true,

                maintainAspectRatio:false,

                animation:false,

                plugins:{
                    legend:{
                        display:true
                    }
                },

                scales:{
                    y:{
                        beginAtZero:true,
                        ticks:{
                            precision:0
                        }
                    }
                }
            }
        }
    );

}

/* =====================================================
   EXPORTAÇÃO
===================================================== */

function download(content,filename,type){

    const blob =
        new Blob([content],{ type });

    const url =
        URL.createObjectURL(blob);

    const a =
        document.createElement('a');

    a.href = url;
    a.download = filename;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}

const csvEscape = value => {
    return `"${String(value).replace(/"/g,'""')}"`;
};

/* CSV LOGS */

$('#export-logs-csv')
.addEventListener('click', () => {

    if(!logs.length){
        alert('Sem registros.');
        return;
    }

    const csv = [
        'Data,Hora,Refeicao,Matricula,Nome,Segmento',

        ...logs.map(log => [
            log.date,
            log.hour,
            csvEscape(log.meal),
            csvEscape(log.studentId),
            csvEscape(log.studentName),
            csvEscape(log.segment)
        ].join(','))

    ].join('\n');

    download(
        csv,
        generateFileName('logs','csv'),
        'text/csv'
    );

});

/* XLSX LOGS */

$('#export-logs-xlsx')
.addEventListener('click', () => {

    if(!logs.length){
        alert('Sem registros.');
        return;
    }

    const ws =
        XLSX.utils.json_to_sheet(logs);

    const wb =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Logs'
    );

    XLSX.writeFile(
        wb,
        generateFileName('logs','xlsx')
    );

});

/* CSV STUDENTS */

$('#export-students-csv')
.addEventListener('click', () => {

    if(!students.length){
        alert('Sem alunos.');
        return;
    }

    const csv = [
        'Nome,Matricula,Segmento',

        ...students.map(student => [
            csvEscape(student.name),
            csvEscape(student.id),
            csvEscape(student.segment)
        ].join(','))

    ].join('\n');

    download(
        csv,
        generateFileName('students','csv'),
        'text/csv'
    );

});

/* XLSX STUDENTS */

$('#export-students-xlsx')
.addEventListener('click', () => {

    if(!students.length){
        alert('Sem alunos.');
        return;
    }

    const ws =
        XLSX.utils.json_to_sheet(students);

    const wb =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Alunos'
    );

    XLSX.writeFile(
        wb,
        generateFileName('students','xlsx')
    );

});

/* =====================================================
   BACKUP
===================================================== */

$('#backup-btn')
.addEventListener('click', () => {

    const backup = {
        students,
        logs,
        exportedAt:new Date().toISOString()
    };

    download(
        JSON.stringify(backup,null,2),
        generateFileName('backup','json'),
        'application/json'
    );

});

/* =====================================================
   LIMPAR SISTEMA
===================================================== */

$('#clear-btn')
.addEventListener('click', () => {

    const confirmClear =
        confirm("⚠️ AVISO: Perigo!\n\n🔴 CUIDADO EXTREMO: \nIsso apagará TODOS OS ALUNOS e HISTÓRICO do navegador.\n\nRecomendamos baixar o Backup JSON antes. \n\nTem absoluta certeza que deseja formatar o sistema?");

    if(!confirmClear){
        return;
    }

    localStorage.removeItem(
        STORAGE_KEYS.students
    );

    localStorage.removeItem(
        STORAGE_KEYS.logs
    );

    students = [];
    logs = [];

    renderStudents();
    renderDashboard();

    alert('Sistema limpo.');

});

/* =====================================================
   IMPRESSÃO DE CRACHÁS
===================================================== */

$('#print-badges-btn')
.addEventListener(
    'click',
    printBadges
);

function printBadges(){

    if(!students.length){

        alert('Não há alunos.');

        return;
    }

    const win =
        window.open('','_blank');

    let html = `
    <html>
    <head>

    <title>
        Crachás ESEDRAT
    </title>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>

    <style>

    body{
        font-family:Arial,sans-serif;
        display:flex;
        flex-wrap:wrap;
        gap:15px;
        padding:20px;
        justify-content:center;
        background: #fff; 
        margin: 0;
    }

    .badge{
        width:8.5cm;
        height:5.5cm;
        border:2px solid #1565C0;
        border-radius:12px;
        padding:10px;
        position:relative;
        overflow:hidden;
        page-break-inside:avoid; 
        box-sizing: border-box;        
        background: #fff;
         
    }

    .badge::before{
        content:'';
        position:absolute;
        top:0;
        left:0;
        width:100%;
        height:15px; 
        background: #1565C0; 
    }

    .logos{
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-top:10px; 
        margin-bottom: 5px;
    }

    .logo{
        height:35px;
        object-fit:contain;
    }

    .name{
        font-weight:bold;
        margin-top:12px;
        font-size:14px;
        text-transform:uppercase; 
        color: #000; 
        line-height: 1.1; 
        margin-bottom: 6px;
    }

    .matricula { 
        font-size: 11px; 
        color: #555; 
    }

    .segmento { 
        font-size: 10px; 
        background: #E3F2FD; 
        color: #1565C0; 
        padding: 3px 6px; 
        border-radius: 4px; 
        display: inline-block; 
        font-weight: bold; 
        margin-top: 5px; 
        border: 1px solid #BBDEFB;
    }

    .info{
        margin-top:5px;
        font-size:11px;
        width: 60%; 
        float: left;
    }

    .qr{
        position:absolute;
        bottom:12px;
        right:12px;
        background:#FFF;
        padding:2px;
        border-radius:6px; 
        border: 2px solid #D32F2F;
        background: #fff;
    }

    .print-btn{
        width:100%;
        text-align:center;
        margin-bottom:20px;
    }

    @media print{
        .print-btn{
            display:none; 
        }        
    }

    </style>

    </head>

    <body>

    <div class="print-btn">
        <button
            onclick="window.print()"
            style="
                padding:15px 25px;
                font-size:18px;
                font-weight:bold;
                background:#1565C0;
                color:#FFF;
                border:none;
                border-radius:10px;
                cursor:pointer;
            "
        >
            🖨️ IMPRIMIR
        </button>
        <p style="color: #666;">Nas configurações de impressão (Ctrl+P), ative a opção <b>"Gráficos de plano de fundo"</b>.</p>
    </div>
    `;

    students.forEach((student,index) => {

        html += `
        <div class="badge">

            <div class="logos">

                <img
                    src="logos_ESEDRAT.png"
                    class="logo"
                >

                <img
                    src="logos_MG.png"
                    class="logo"
                >

            </div>

            <div class="name">
                ${student.name}
            </div>

            <div class="matricula">
                Matrícula:
                ${student.id}
            </div>

            <div class="segmento">
                ${student.segment}
            </div>

            <div
                class="qr"
                id="qr-${index}"
            ></div>

        </div>
        `;

    });

    const hashes =
        students.map(s => s.hash);

    html += `
    <script>

    window.onload = function(){

        const hashes =
            ${JSON.stringify(hashes)};

        hashes.forEach((hash,index) => {

            new QRCode(
                document.getElementById(
                    'qr-' + index
                ),
                {
                    text:hash,
                    width:80,
                    height:80
                }
            );

        });

    }

    <\/script>

    </body>
    </html>
    `;

    win.document.write(html);
    win.document.close();
}

/* =====================================================
   INIT
===================================================== */

window.addEventListener('load', () => {

    renderStudents();

    renderDashboard();

    startCamera();

});

})();