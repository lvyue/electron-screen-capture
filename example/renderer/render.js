const { ipcRenderer } = require('electron');

const captureBtn = document.querySelector('#capture-btn');
captureBtn.addEventListener(
    'click',
    () => {
        ipcRenderer.send('screen-capture::action', { type: 'start' });
    },
    false,
);
