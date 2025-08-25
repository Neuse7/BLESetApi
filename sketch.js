const scanButton = document.getElementById('scanButton');
const disconnectButton = document.getElementById('disconnectButton');
const downloadButton = document.getElementById('downloadCsvButton');
const sendButton = document.getElementById('sendButton');
const fastRateButton = document.getElementById('fastRateButton');
const slowRateButton = document.getElementById('slowRateButton');
const messageDiv = document.getElementById('messageDiv');
const value1 = document.getElementById('value1');
const value2 = document.getElementById('value2');
const value3 = document.getElementById('value3');
const saveProgress = document.getElementById('saveProgress');
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'; // Nordic UART Service UUID
const UART_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // RX Characteristic UUID
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // TX Characteristic UUID
const graph = document.getElementById('graph');

let device, server, uartService, txCharacteristic, rxCharacteristic;
let expectedPacketCount = 0;
let receivedPacketCount = 0;
let totalEntries = 0;
let currentEntries = 0;
let csvRows = [];
let writeInProgress = false;
const writeQueue = [];
const rawDataPackets = []; // 生データ格納用
	
function displayMessage(message) {
    messageDiv.textContent = message;
}
		
// 数値入力が変更されたときにグラフを更新
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', drawCuboid);
});

function drawCuboid() {
    // 入力値を取得
    var x = parseFloat(document.getElementById('value1').value);
    var y = parseFloat(document.getElementById('value2').value);
    var z = parseFloat(document.getElementById('value3').value);
    // 直方体の各頂点の座標を計算
    var vertices = [
        [-x, -y, -z], [ x, -y, -z],
        [ x,  y, -z], [-x,  y, -z],
        [-x, -y,  z], [ x, -y,  z],
        [ x,  y,  z], [-x,  y,  z]
    ];
    // 直方体の辺を構成する点を結ぶためのラインセグメント
    var edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    // 座標軸に対応する x, y, z の値を分けて配列に格納
    var x_vals = [], y_vals = [], z_vals = [];
    for (var i = 0; i < vertices.length; i++) {
        x_vals.push(vertices[i][0]);
        y_vals.push(vertices[i][1]);
        z_vals.push(vertices[i][2]);
    }
    // 原点を大きな点で表示
    var origin = {
        type: 'scatter3d',
        mode: 'markers',
        x: [0],
        y: [0],
        z: [0],
        marker: {
            size: 10,  // 原点のサイズを大きく
            color: 'rgb(0, 0, 0)',  // 黒色
            symbol: 'circle'
        },
				showlegend: false
    };
    // エッジを結ぶためのラインを描画
    var edge_x = [], edge_y = [], edge_z = [];
    for (var i = 0; i < edges.length; i++) {
        var start = edges[i][0];
        var end = edges[i][1];
        edge_x.push(vertices[start][0], vertices[end][0], null);
        edge_y.push(vertices[start][1], vertices[end][1], null);
        edge_z.push(vertices[start][2], vertices[end][2], null);
    }
    // 各軸の最大・最小値を取得
    var x_min = Math.min(...x_vals);
    var x_max = Math.max(...x_vals);
    var y_min = Math.min(...y_vals);
    var y_max = Math.max(...y_vals);
    var z_min = Math.min(...z_vals);
    var z_max = Math.max(...z_vals);
    // 最大の範囲に合わせるための調整
    var max_range = Math.max(Math.max(...x_vals), Math.max(...y_vals), Math.max(...z_vals), 0);
    var min_range = Math.min(Math.min(...z_vals), Math.min(...y_vals), Math.min(...x_vals), 0);
    // グラフのレイアウト設定
    var layout = {
        scene: {
            xaxis: {
                title: 'X',
                range: [min_range - 1, max_range + 1]
            },
            yaxis: {
                title: 'Y',
                range: [min_range - 1, max_range + 1]
            },
            zaxis: {
                title: 'Z',
                range: [min_range - 1, max_range + 1]
            },
            aspectmode: 'cube' 
        },
        responsive: true  // レスポンシブにする
    };
    // エッジのデータを追加
    var data = [{
        type: 'scatter3d',
        mode: 'lines',
        x: edge_x,
        y: edge_y,
        z: edge_z,
        line: {
            color: 'rgb(255, 0, 0)',
            width: 3
        },
				showlegend: false  // ここで凡例を非表示にする
    }, origin];
    // グラフを描画
    Plotly.newPlot('graph', data, layout);
}

function getCurrentTimeString() {
    const now = new Date();
		const year = now.getFullYear() % 100; // 年
    const month = now.getMonth() + 1; // 月（0から始まるため +1）
    const day = now.getDate(); // 日
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
		const timedata = new Uint8Array(8); // 1バイトのアドレス + 6バイトのデータ
    timedata[0] = 0x03; // アドレスとして使用する1バイト
    timedata[1] = seconds + Math.floor(seconds / 10) * 6;
		timedata[2] = minutes + Math.floor(minutes / 10) * 6;
    timedata[3] = hours + Math.floor(hours / 10) * 6;
    timedata[4] = 0x00;
    timedata[5] = day + Math.floor(day / 10) * 6;
    timedata[6] = month + Math.floor(month / 10) * 6;
    timedata[7] = year + Math.floor(year / 10) * 6;
		rxCharacteristic.writeValue(timedata);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
		
function resetButtons() {
    scanButton.disabled = false;
    sendButton.disabled = true;
		downloadButton.disabled = true;
    disconnectButton.disabled = true;
    fastRateButton.disabled = true; // Disable Fast Rate button
    slowRateButton.disabled = true; // Disable Slow Rate button
}
		
// 接続が切れた場合の処理
function handleDisconnection() {
    resetButtons();
    displayMessage('デバイスが切断されました');
}

scanButton.addEventListener('click', async () => {
    try {
        const options = {
            filters: [{ services: [UART_SERVICE_UUID] }],
            optionalServices: [UART_SERVICE_UUID]
        };
        const device = await navigator.bluetooth.requestDevice(options);
				// 接続が切れたときのイベントを設定
        device.addEventListener('gattserverdisconnected', handleDisconnection);
        await connectToDevice(device);
    } catch (error) {
        console.error('Error during scan:', error);
        displayMessage('エラー: デバイスが見つかりませんでした');
    }
});

async function connectToDevice(selectedDevice) {
    try {
        device = selectedDevice;
        displayMessage('接続中...');

        server = await device.gatt.connect();
        uartService = await server.getPrimaryService(UART_SERVICE_UUID);
        txCharacteristic = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        rxCharacteristic = await uartService.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);

        // Set up notifications for incoming data
        //txCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
				txCharacteristic.addEventListener('characteristicvaluechanged', async (event) => {
            await handleDataReceived(event);
        });
        await txCharacteristic.startNotifications();
				
        // Immediately send 0x0A after connection
        const dataToSend = new Uint8Array([0x0A]);
        await rxCharacteristic.writeValue(dataToSend);
				
        sendButton.disabled = false;
        downloadButton.disabled = false;
        fastRateButton.disabled = false; // Enable Fast Rate button
        slowRateButton.disabled = false; // Enable Slow Rate button
        disconnectButton.disabled = false;
        displayMessage('接続完了');
    } catch (error) {
        console.error('Error during connection:', error);
        displayMessage('エラー: デバイスと接続できませんでした');
    }
}

disconnectButton.addEventListener('click', async () => {
    try {
        if (server) {
            await server.disconnect();
            server = null;
            uartService = null;
            txCharacteristic = null;
            rxCharacteristic = null;
          
            handleDisconnection(); // 接続切れ時の処理
        }
    } catch (error) {
        console.error('Error during disconnection:', error);
        displayMessage('エラー: デバイスを切断できませんでした');
    }
});
		
function showProgressBar() {
    document.getElementById('progress-container').style.display = 'block';
}

function hideProgressBar() {
    document.getElementById('progress-container').style.display = 'none';
}
		
function initProgressBar() {
    sendButton.disabled = true;
    downloadButton.disabled = true;
    fastRateButton.disabled = true;
    slowRateButton.disabled = true;
    demoRateButton.disabled = true;
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.value = 0;
}
		
function updateProgressBar() {
    const progressElement = document.getElementById('progressBar');
    if (totalEntries > 0) {
        const percent = Math.floor((currentEntries / totalEntries) * 100);
        progressElement.value = percent;
    }
}
		
let pendingSensorData = null;

function toInt32LE(bytes, offset) {
    return (new DataView(bytes.buffer)).getInt32(offset, true);
}

function toUint16LE(bytes, offset) {
    return (new DataView(bytes.buffer)).getUint16(offset, true);
}
		
function toInt16LE(bytes, offset) {
    return (new DataView(bytes.buffer)).getInt16(offset, true);
}

function parseCustomFloat16(bytes, offset) {
    const combined = toInt16LE(bytes, offset); // 16bit値
    const intPart = combined >> 7;              // 上位9ビット
   	const fracPart = (combined & 0x7F) / 128;   // 下位7ビットを128で割る
   	return intPart + fracPart;
}

function formatMacAddress(bytes, offset) {
    return [...Array(6)].map((_, i) => bytes[offset + i].toString(16).padStart(2, '0')).join(':');
}
		
function processRawPackets() {
    initProgressBar();
    currentEntries = 0;

    for (const raw of rawDataPackets) {
        for (let i = 0; i < raw.length; i += 32) {
            const packet = raw.slice(i, i + 32); // ← 32バイトに分割
            if (packet[0] === 0xBB) {
                const stateMap = {
                    0xB0: 'IDLE',
                    0xB1: 'ACTIVE',
                    0xBF: 'FIRE'
                };
                const state = stateMap[packet[1]] || 'UNKNOWN';
                const mac = formatMacAddress(packet, 2);
                csvRows.push([state, mac]);
            } else if (packet[0] === 0xAA && packet[1] === 0xAA) {
                const x = toInt32LE(packet, 2);
                const y = toInt32LE(packet, 6);
                const z = toInt32LE(packet, 10);
                const dist = toUint16LE(packet, 14);
                const azim = parseCustomFloat16(packet, 16);
                const elev = parseCustomFloat16(packet, 18);
                const accX = toInt16LE(packet, 20);
                const accY = toInt16LE(packet, 22);
                const accZ = toInt16LE(packet, 24);
                const gyrX = toInt16LE(packet, 26);
                const gyrY = toInt16LE(packet, 28);
                const gyrZ = toInt16LE(packet, 30);
                const fullRow = [null, null, x, y, z, dist, azim, elev, accX, accY, accZ, gyrX, gyrY, gyrZ];
                csvRows.push(fullRow);
            }
            currentEntries += 32;
            updateProgressBar();
        }
    }
    hideProgressBar();
}
		
let dataReceiveTimeoutHandle = null;

function startDataReceiveTimeout() {
    clearTimeout(dataReceiveTimeoutHandle); // 念のためリセット
    dataReceiveTimeoutHandle = setTimeout(() => {
        hideProgressBar();
        sendButton.disabled = false;
        downloadButton.disabled = false;
        fastRateButton.disabled = false;
        slowRateButton.disabled = false;
        demoRateButton.disabled = false;
        displayMessage("エラー: デバイスからの応答がありません");
    }, 3000); // 3秒待つ
}

function cancelDataReceiveTimeout() {
    if (dataReceiveTimeoutHandle) {
        clearTimeout(dataReceiveTimeoutHandle);
        dataReceiveTimeoutHandle = null;
    }
}
	
downloadButton.addEventListener('click', async () => {
    try {
        // すでに「CSV保存」ボタンが表示されている場合は警告を出す
        const saveCsvButton = document.getElementById('saveCsvButton');
        if (saveCsvButton.style.display !== 'none') {
            const confirmReset = confirm("未保存のデータがあります。削除して新たに開始してもよろしいですか？");
            if (!confirmReset) {
                displayMessage("操作はキャンセルされました。");
                return;
            }
        }

        // 状態初期化
        csvRows = [];                    // CSV用の配列を初期化
        rawDataPackets.length = 0;
        receivedPacketCount = 0;
        expectedPacketCount = 0;
        document.getElementById('saveCsvButton').style.display = 'none'; // 古い保存ボタンを非表示

        initProgressBar();              // プログレスバーを初期化（例: 0%に）
        showProgressBar();

        // ペリフェラルに「データ送信開始」を伝える
        const startSignal = new Uint8Array([0xA5]);
        await rxCharacteristic.writeValue(startSignal);
        displayMessage("データ受信を開始します...");
        startDataReceiveTimeout();
        csvRows = [['STATE', 'TIME', 'x', 'y', 'z', 'Dist(cm)', 'azimuth', 'elevation', 'ac-x', 'ac-y', 'ac-z', 'gy-x', 'gy-y', 'gy-z']];
        // データは handleDataReceived() で受信され続ける
    } catch (error) {
        console.error("ダウンロード失敗:", error);
        displayMessage("エラー：ダウンロードに失敗しました");
    }
});
		
document.getElementById('saveCsvButton').addEventListener('click', async () => {
    processRawPackets();
    try {
        const csvContent = csvRows.map(e => e.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const opts = {
            suggestedName: 'logData.csv',
            types: [{ description: 'CSVファイル', accept: { 'text/csv': ['.csv'] } }]
        };
        const handle = await window.showSaveFilePicker(opts);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        displayMessage("ダウンロードが完了しました");
        document.getElementById('saveCsvButton').style.display = 'none';
		} catch (err) {
        console.error("保存処理中にエラー:", err);
        displayMessage("エラー：ダウンロードがキャンセルまたは失敗しました");
    }
});

sendButton.addEventListener('click', async () => {
    try {
        if (!rxCharacteristic) {
            displayMessage('エラー: デバイスと接続できませんでした');
            return;
        }
        const num1 = parseInt(value1.value, 10) || 0;
        const num2 = parseInt(value2.value, 10) || 0;
        const num3 = parseInt(value3.value, 10) || 0;
				
        if (num1 < 0 || num1 > 65535 || num2 < 0 || num2 > 65535 || num3 < 0 || num3 > 65535) {
            displayMessage('エラー: 入力不可の値が含まれています');
            return;
        }

        const data = new Uint8Array(7); // 1バイトのアドレス + 6バイトのデータ
        data[0] = 0x01; // アドレスとして使用する1バイト
        data[1] = num1 & 0xFF;
        data[2] = (num1 >> 8) & 0xFF;
        data[3] = num2 & 0xFF;
        data[4] = (num2 >> 8) & 0xFF;
        data[5] = num3 & 0xFF;
        data[6] = (num3 >> 8) & 0xFF;
				
        await rxCharacteristic.writeValue(data);
        // Get current time
        const timeString = getCurrentTimeString();
        displayMessage(`データ送信完了( ${timeString} )`);
    } catch (error) {
        console.error('Error during data send:', error);
        displayMessage('エラー: データ送信に失敗しました');
    }
});

// Fast Rate button event listener
fastRateButton.addEventListener('click', async () => {
    try {
        if (!rxCharacteristic) {
            displayMessage('エラー: デバイスと接続できませんでした');
            return;
        }
        const fastRateData = new Uint8Array(7); // 1バイトのアドレス + 2バイトのデータ
        fastRateData[0] = 0x02; // アドレス
        fastRateData[1] = 6 & 0xFF;
        fastRateData[2] = (6 >> 8) & 0xFF;
        fastRateData[3] = 12 & 0xFF;
        fastRateData[4] = (12 >> 8) & 0xFF;
        fastRateData[5] = 5 & 0xFF;
        fastRateData[6] = (5 >> 8) & 0xFF;

        await rxCharacteristic.writeValue(fastRateData);
        const timeString = getCurrentTimeString();
        displayMessage(`Fast Rate 送信完了( ${timeString} )`);
    } catch (error) {
        console.error('Error during fast rate send:', error);
        displayMessage('エラー: Fast Rate送信に失敗しました');
    }
});

// Slow Rate button event listener
slowRateButton.addEventListener('click', async () => {
    try {
        if (!rxCharacteristic) {
            displayMessage('エラー: デバイスと接続できませんでした');
            return;
        }
        const slowRateData = new Uint8Array(7); // 1バイトのアドレス + 2バイトのデータ
        slowRateData[0] = 0x02; // アドレス
        slowRateData[1] = 6 & 0xFF;
        slowRateData[2] = (6 >> 8) & 0xFF;
        slowRateData[3] = 60 & 0xFF;
        slowRateData[4] = (60 >> 8) & 0xFF;
        slowRateData[5] = 4 & 0xFF;
        slowRateData[6] = (4 >> 8) & 0xFF;

        await rxCharacteristic.writeValue(slowRateData);
        const timeString = getCurrentTimeString();
        displayMessage(`Slow Rate 送信完了( ${timeString} )`);
    } catch (error) {
        console.error('Error during slow rate send:', error);
        displayMessage('エラー: Slow Rate送信に失敗しました');
    }
});
		
async function queueWriteRequest(data) {
    writeQueue.push(data);
    if (!writeInProgress) {
        writeInProgress = true;
        while (writeQueue.length > 0) {
            const next = writeQueue.shift();
            try {
                await rxCharacteristic.writeValue(next);
            } catch (err) {
                console.error("Write failed:", err);
                // 再試行や中断の判断が必要ならここに書く
            }
        }
        writeInProgress = false;
    }
}
		
async function handleDataReceived(event) {
    const value = event.target.value;
    // 受信したデータを解析して、value1, value2, value3に反映
    const receivedData = new Uint8Array(value.buffer);
    // 受信データをvalue1, value2, value3に設定
    if (receivedData[0] == 0x10) {
        const num1 = receivedData[1] | (receivedData[2] << 8);  // 2バイトの数値
        const num2 = receivedData[3] | (receivedData[4] << 8);  // 2バイトの数値
        const num3 = receivedData[5] | (receivedData[6] << 8);  // 2バイトの数値
        value1.value = num1;
        value2.value = num2;
        value3.value = num3;
    }
    else if (receivedData[0] == 0x11) {
        const trimmedData = receivedData.slice(1);
        rawDataPackets.push(trimmedData); // 処理せず保存
        currentEntries += 128;
        updateProgressBar();
        if (totalEntries && currentEntries >= totalEntries) {
            document.getElementById('saveCsvButton').style.display = 'inline-block';
            displayMessage("データ受信完了。Downloadボタンを押してください。");
            sendButton.disabled = false;
            downloadButton.disabled = false;
            fastRateButton.disabled = false;
            slowRateButton.disabled = false;
            demoRateButton.disabled = false;
            hideProgressBar();
        }
        await queueWriteRequest(new Uint8Array([0xA6]));
    }
    else if (receivedData[0] == 0x1F) {
        cancelDataReceiveTimeout();
        totalEntries = (receivedData[1] | (receivedData[2] << 8) | (receivedData[3] << 16) | (receivedData[4] << 24)) >>> 0;
        if (totalEntries === 0) {
            displayMessage("受信データがありません。");
        　　sendButton.disabled = false;
        　　downloadButton.disabled = false;
        　　fastRateButton.disabled = false;
        　　slowRateButton.disabled = false;
		　　　　hideProgressBar();
　　　　　　return;
    　　}
        currentEntries = 0;
        console.log("totalEntries set:", totalEntries);
        updateProgressBar();
        await rxCharacteristic.writeValue(new Uint8Array([0xA6]));
    }
    else {
        displayMessage('エラー: 不正なデータを受信しました');
    }
}

function preventNegativeInput(event) {
    if (event.target.value < 0) {
        event.target.value = 0;
    }
}
		
// 初期表示で直方体を描画
drawCuboid();
resetButtons();
		
value1.addEventListener('input', preventNegativeInput);
value2.addEventListener('input', preventNegativeInput);
value3.addEventListener('input', preventNegativeInput);
