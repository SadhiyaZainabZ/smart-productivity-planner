// Utility: Time formatters
const toDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
};

const formatTime = (decimalHour) => {
    let h = Math.floor(decimalHour);
    let m = Math.round((decimalHour - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    const ampm = (h % 24 >= 12) ? 'PM' : 'AM';
    let displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const generateId = () => Math.random().toString(36).substr(2, 9);
const getTodayStr = () => new Date().toISOString().split('T')[0];

// Main App State
let appData = JSON.parse(localStorage.getItem('smartPlannerData')) || {};
const todayStr = getTodayStr();

// --- UI UPDATES ---
function updateDateDisplay() {
    const now = new Date();
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    const fullDate = now.toLocaleDateString(undefined, options);
    document.getElementById('currentDateDisplay').textContent = fullDate;
    document.getElementById('mainDateDisplay').textContent = fullDate;
}

function toggleTaskStatus(id) {
    const block = appData[todayStr].find(b => b.id === id);
    if (block && block.type === 'flexible') {
        const states = ['pending', 'completed', 'missed'];
        let currentIndex = states.indexOf(block.status || 'pending');
        block.status = states[(currentIndex + 1) % states.length];
        saveAndSync();
    }
}

function saveAndSync() {
    localStorage.setItem('smartPlannerData', JSON.stringify(appData));
    renderTimeline();
    updateDashboard();
    updateCoach();
}

// --- ENGINE: ASSIGN AFTER COLLEGE ---
document.getElementById('config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const isHoliday = document.getElementById('holidayMode').checked;
    const tasksRaw = document.getElementById('tasksInput').value;
    const tasksArray = tasksRaw.split(',').map(t => t.trim()).filter(t => t);

    const sleep = parseFloat(document.getElementById('sleepHours').value) || 0;
    const getReady = parseFloat(document.getElementById('getReadyTime').value) || 0;
    const travel = parseFloat(document.getElementById('travelTime').value) || 0;
    const meal = parseFloat(document.getElementById('mealDuration').value) || 0;
    const cStart = toDecimal(document.getElementById('collegeStart').value);
    const cEnd = toDecimal(document.getElementById('collegeEnd').value);

    let blocks = [];
    let taskGaps = [];

    // 1. Fixed Blocks
    blocks.push({ id: generateId(), title: 'Sleep', start: 0, end: sleep, type: 'fixed' });

    if (isHoliday || isNaN(cStart)) {
        const prepEnd = sleep + getReady;
        blocks.push({ id: generateId(), title: 'Get Ready', start: sleep, end: prepEnd, type: 'fixed' });
        taskGaps.push({ start: prepEnd, end: 23.9 });
        document.getElementById('dayTypeBadge').textContent = 'Holiday';
    } else {
        const prepEnd = sleep + getReady;
        const travelToCollegeStart = cStart - travel;
        const travelHomeEnd = cEnd + travel;
        const mealEnd = travelHomeEnd + meal;

        blocks.push({ id: generateId(), title: 'Get Ready', start: sleep, end: prepEnd, type: 'fixed' });
        
        // Morning gap as non-task time
        if (travelToCollegeStart > prepEnd) {
            blocks.push({ id: generateId(), title: 'Morning Prep/Commute', start: prepEnd, end: travelToCollegeStart, type: 'fixed' });
        }

        blocks.push({ id: generateId(), title: 'Travel', start: travelToCollegeStart, end: cStart, type: 'fixed' });
        blocks.push({ id: generateId(), title: 'College', start: cStart, end: cEnd, type: 'fixed' });
        blocks.push({ id: generateId(), title: 'Travel', start: cEnd, end: travelHomeEnd, type: 'fixed' });
        blocks.push({ id: generateId(), title: 'Meal Break', start: travelHomeEnd, end: mealEnd, type: 'fixed' });

        // Only assign tasks after Meal Break
        if (mealEnd < 23.9) {
            taskGaps.push({ start: mealEnd, end: 23.9 });
        }
        document.getElementById('dayTypeBadge').textContent = 'Weekday';
    }

    // 2. Distribute Tasks
    const totalGapTime = taskGaps.reduce((acc, g) => acc + (g.end - g.start), 0);
    const timePerTask = tasksArray.length > 0 ? totalGapTime / tasksArray.length : 0;

    let taskIdx = 0;
    taskGaps.forEach(gap => {
        let cursor = gap.start;
        while (cursor + 0.01 < gap.end && taskIdx < tasksArray.length) {
            let taskEnd = cursor + timePerTask;
            blocks.push({
                id: generateId(),
                title: tasksArray[taskIdx],
                start: cursor,
                end: Math.min(taskEnd, gap.end),
                type: 'flexible',
                status: 'pending'
            });
            cursor = taskEnd;
            taskIdx++;
        }
    });

    appData[todayStr] = blocks.sort((a, b) => a.start - b.start);
    saveAndSync();
});

function renderTimeline() {
    const container = document.getElementById('timeline');
    container.innerHTML = '';
    const dayBlocks = appData[todayStr] || [];

    dayBlocks.forEach(block => {
        const card = document.createElement('div');
        card.className = `card ${block.type} ${block.status || ''}`;
        card.innerHTML = `
            <div class="card-time">${formatTime(block.start)} - ${formatTime(block.end)}</div>
            <div class="card-content">
                ${block.title}
                ${block.type === 'flexible' ? `<span class="status-badge">${block.status}</span>` : ''}
            </div>
        `;
        if (block.type === 'flexible') card.onclick = () => toggleTaskStatus(block.id);
        container.appendChild(card);
    });
}

function updateDashboard() {
    const tasks = (appData[todayStr] || []).filter(b => b.type === 'flexible');
    const completed = tasks.filter(t => t.status === 'completed').length;
    const missed = tasks.filter(t => t.status === 'missed').length;
    
    document.getElementById('statTotal').textContent = tasks.length;
    document.getElementById('statCompleted').textContent = completed;
    document.getElementById('statMissed').textContent = missed;
    
    const dailyScore = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    document.getElementById('dailyScoreSidebar').textContent = dailyScore + "%";
    document.getElementById('progressBar').style.width = dailyScore + '%';
}

function updateCoach() {
    const allDays = Object.keys(appData);
    let total = 0, done = 0;

    allDays.forEach(dayKey => {
        const tasks = appData[dayKey].filter(b => b.type === 'flexible');
        total += tasks.length;
        done += tasks.filter(t => t.status === 'completed').length;
    });

    const weeklyAvg = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('weeklyScore').textContent = weeklyAvg + '%';
}

// Init
updateDateDisplay();
renderTimeline();
updateDashboard();
updateCoach();