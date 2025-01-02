document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing application...');

    // Elements
    const fileList = document.getElementById('file-list');
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const removeSelectedBtn = document.getElementById('remove-selected');
    const clearFilesBtn = document.getElementById('clear-files');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // State
    let isProcessing = false;
    let selectedFiles = new Set();
    let fileListData = [];
    let audioProcessor = new AudioProcessor();
    
    // Chart state
    let currentChartData = null;
    let chartDataHash = null;
    
    // Initialize tabs
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            console.log('Switching to tab:', tabId);
            
            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // File handling
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (!isProcessing) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    });

    document.querySelector('.upload-button').addEventListener('click', () => {
        if (!isProcessing) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (!isProcessing && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    });

    async function handleFiles(files) {
        if (isProcessing) return;
        isProcessing = true;
        uploadZone.classList.add('loading');

        try {
            // First, add all files to the list
            for (const file of files) {
                const fileId = generateFileId(file);
                fileListData.push({ id: fileId, name: file.name, file });
            }
            updateFileList();

            // Stage 1: Get file info for all files
            showProcessingStatus('', 'Stage 1/3: Reading file info...');
            const fileInfoResults = [];
            for (const file of files) {
                try {
                    const fileInfo = await audioProcessor.getFileInfo(file);
                    fileInfoResults.push({ filename: file.name, file_info: fileInfo });
                } catch (error) {
                    console.error(`Error getting file info for ${file.name}:`, error);
                    showError(`Error reading ${file.name}: ${error.message}`);
                }
            }
            updateFileInfoTable(fileInfoResults);

            // Stage 2: Process loudness for all files
            showProcessingStatus('', 'Stage 2/3: Analyzing loudness...');
            const loudnessResults = [];
            for (const file of files) {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFile(file);
                    const results = await audioProcessor.loudnessAnalyzer.analyzeLoudness(audioBuffer);
                    loudnessResults.push({
                        filename: file.name,
                        lufs_i: results.integratedLoudness.toFixed(1),
                        lufs_s_max: results.shortTermMax.toFixed(1),
                        lra: results.loudnessRange.toFixed(1),
                        sample_peak: results.samplePeak.toFixed(1),
                        true_peak: results.truePeak.toFixed(1)
                    });
                    updateLoudnessTable(loudnessResults);
                } catch (error) {
                    console.error(`Error analyzing loudness for ${file.name}:`, error);
                    showError(`Error analyzing ${file.name}: ${error.message}`);
                }
            }

            // Stage 3: Process multiband for all files
            showProcessingStatus('', 'Stage 3/3: Analyzing frequency bands...');
            const multibandResults = [];
            for (const file of files) {
                try {
                    const audioBuffer = await audioProcessor.loadAudioFile(file);
                    const results = await audioProcessor.filters.processMultiband(audioBuffer);
                    multibandResults.push({
                        filename: file.name,
                        ...results
                    });
                    updateMultibandTables(multibandResults);
                } catch (error) {
                    console.error(`Error analyzing multiband for ${file.name}:`, error);
                    showError(`Error analyzing ${file.name}: ${error.message}`);
                }
            }

        } finally {
            isProcessing = false;
            uploadZone.classList.remove('loading');
            clearProcessingStatus();
            fileInput.value = '';
        }
    }

    function updateFileList() {
        fileList.innerHTML = '';
        fileListData.forEach((fileData, index) => {
            const item = document.createElement('div');
            item.className = 'file-list-item';
            item.dataset.index = index;
            item.textContent = fileData.name;
            if (selectedFiles.has(index)) {
                item.classList.add('selected');
            }
            fileList.appendChild(item);
        });
    }

    function updateFileInfoTable(results) {
        const tbody = document.querySelector('#file-info tbody');
        if (!tbody) return;

        results.forEach(result => {
            if (!result.file_info) return;
            
            const info = result.file_info;
            const existingRow = Array.from(tbody.rows).find(row => 
                row.cells[0].textContent === result.filename
            );
            
            const rowContent = `
                    <td>${result.filename}</td>
                    <td>${info.format}</td>
                    <td>${info.sample_rate}</td>
                    <td>${info.bit_depth}</td>
                    <td>${info.duration}</td>
                    <td>${info.file_size}</td>
                `;

            if (existingRow) {
                existingRow.innerHTML = rowContent;
            } else {
                const row = tbody.insertRow();
                row.innerHTML = rowContent;
            }
        });
    }

    function updateLoudnessTable(results) {
        const tbody = document.querySelector('#loudness-results tbody');
        if (!tbody) return;

        results.forEach(result => {
            const existingRow = Array.from(tbody.rows).find(row => 
                row.cells[0].textContent === result.filename
            );
            
            const rowContent = `
                <td>${result.filename}</td>
                <td>${result.lufs_i ? result.lufs_i : 'N/A'}</td>
                <td>${result.lufs_s_max ? result.lufs_s_max : 'N/A'}</td>
                <td>${result.lra ? result.lra : 'N/A'}</td>
                <td>${result.sample_peak ? result.sample_peak : 'N/A'}</td>
                <td>${result.true_peak ? result.true_peak : 'N/A'}</td>
            `;
            
            if (existingRow) {
                existingRow.innerHTML = rowContent;
            } else {
                const row = tbody.insertRow();
                row.innerHTML = rowContent;
            }
        });
    }

    function updateMultibandTables(results) {
        const rmsTableBody = document.querySelector('#multiband-rms tbody');
        const ratiosTableBody = document.querySelector('#multiband-ratios tbody');
        const createChartBtn = document.getElementById('create-chart');

        results.forEach(result => {
            // Update RMS table
            const rmsRowContent = `
                <td>${result.filename}</td>
                <td>${result.low.toFixed(1)}</td>
                <td>${result.mid.toFixed(1)}</td>
                <td>${result.high.toFixed(1)}</td>
            `;

            updateTableRow(rmsTableBody, result.filename, rmsRowContent);

            // Calculate and update ratios
            const lowMidRatio = Math.pow(10, (result.low - result.mid) / 20);
            const midHighRatio = Math.pow(10, (result.mid - result.high) / 20);
            
            const ratiosRowContent = `
                <td>${result.filename}</td>
                <td>${lowMidRatio.toFixed(2)}</td>
                <td>${midHighRatio.toFixed(2)}</td>
            `;

            updateTableRow(ratiosTableBody, result.filename, ratiosRowContent);
        });

        // Enable chart button if we have data
        if (createChartBtn) {
            createChartBtn.disabled = !document.querySelector('#multiband-rms tbody tr');
        }
    }

    function updateTableRow(tbody, filename, content) {
        if (!tbody) return;
        
        const existingRow = Array.from(tbody.rows).find(row => 
            row.cells[0].textContent === filename
        );
        
        if (existingRow) {
            existingRow.innerHTML = content;
        } else {
            const row = tbody.insertRow();
            row.innerHTML = content;
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        const existingErrors = uploadZone.querySelectorAll('.error-message');
        existingErrors.forEach(err => err.remove());
        
        uploadZone.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }

    function generateFileId(file) {
        return `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // File selection and removal
    fileList.addEventListener('click', (e) => {
        const item = e.target.closest('.file-list-item');
        if (item) {
            item.classList.toggle('selected');
            const index = parseInt(item.dataset.index);
            if (item.classList.contains('selected')) {
                selectedFiles.add(index);
            } else {
                selectedFiles.delete(index);
            }
        }
    });

    removeSelectedBtn.addEventListener('click', () => {
        const indicesToRemove = Array.from(selectedFiles).sort((a, b) => b - a);
        for (const index of indicesToRemove) {
            fileListData.splice(index, 1);
        }
        selectedFiles.clear();
        updateFileList();
    });

    clearFilesBtn.addEventListener('click', () => {
        fileListData = [];
        selectedFiles.clear();
        updateFileList();
        
        // Clear all tables
        ['#file-info tbody', '#loudness-results tbody', '#multiband-rms tbody', '#multiband-ratios tbody']
            .forEach(selector => {
                const tbody = document.querySelector(selector);
                if (tbody) tbody.innerHTML = '';
            });

        // Clear chart
        if (window.multibandChart) {
            window.multibandChart.destroy();
            window.multibandChart = null;
        }
        chartDataHash = null;
        currentChartData = null;
    });

    // Add chart modal HTML
    const chartModal = document.createElement('div');
    chartModal.className = 'chart-modal';
    chartModal.style.display = 'none';
    chartModal.innerHTML = `
        <div class="chart-modal-content">
            <span class="close-button">&times;</span>
            <canvas id="multiband-chart"></canvas>
        </div>
    `;
    document.body.appendChild(chartModal);

    // Chart modal controls
    const closeButton = chartModal.querySelector('.close-button');
    closeButton.onclick = () => chartModal.style.display = 'none';
    window.onclick = (e) => {
        if (e.target === chartModal) {
            chartModal.style.display = 'none';
        }
    };

    // Create Chart button handler
    document.getElementById('create-chart')?.addEventListener('click', () => {
        const rows = document.querySelectorAll('#multiband-rms tbody tr');
        if (!rows || rows.length === 0) {
            showError('No data available to view chart');
            return;
        }

        const data = Array.from(rows).map(row => ({
            filename: row.cells[0].textContent,
            low: parseFloat(row.cells[1].textContent),
            mid: parseFloat(row.cells[2].textContent),
            high: parseFloat(row.cells[3].textContent)
        }));

        // Generate hash of current data
        const newHash = JSON.stringify(data);

        // If data hasn't changed and we have a chart, just show it
        if (newHash === chartDataHash && window.multibandChart) {
            chartModal.style.display = 'block';
            return;
        }

        // Otherwise, create new chart
        createMultibandChart(data);
        chartDataHash = newHash;
        currentChartData = data;
        chartModal.style.display = 'block';
    });

    function createMultibandChart(data) {
        const ctx = document.getElementById('multiband-chart').getContext('2d');
        
        // Set canvas background to match Python's dark theme
        ctx.canvas.style.backgroundColor = '#2b2b2b';
        
        // Destroy existing chart if it exists
        if (window.multibandChart) {
            window.multibandChart.destroy();
        }

        // Create frequency bands array
        const frequencyBands = ['Low', 'Mid', 'High'];

        // Generate rainbow colors for each file
        const colors = generateRainbowColors(data.length);

        // Create datasets - one line per file
        const datasets = data.map((fileData, index) => ({
            label: fileData.filename.replace('.wav', ''),  // Remove .wav extension
            data: [fileData.low, fileData.mid, fileData.high],
            borderColor: colors[index],
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 7,
            pointHoverRadius: 9,
            tension: 0,
            pointStyle: 'circle'
        }));

        window.multibandChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: frequencyBands,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 40,
                        right: 60,
                        bottom: 40,
                        left: 70
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: -37,
                        max: 0,
                        grid: {
                            color: 'rgba(85, 85, 85, 0.7)',
                            lineWidth: 1,
                            drawBorder: true,
                            borderColor: '#555555',
                            tickLength: 10,
                            drawTicks: true,
                            offset: false
                        },
                        border: {
                            width: 1,
                            color: '#555555'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                size: 14,
                                family: 'monospace'
                            },
                            padding: 15,
                            stepSize: 1,
                            callback: function(value) {
                                return value === 0 ? '0 dB' : 
                                       value === -37 ? '-37 dB' :
                                       value % 4 === 0 ? value + ' dB' : value;
                            }
                        },
                        title: {
                            display: true,
                            text: 'RMS Level (dB)',
                            color: 'white',
                            font: {
                                size: 14,
                                weight: 'bold',
                                family: 'monospace'
                            },
                            padding: {
                                top: 15,
                                bottom: 15
                            }
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(85, 85, 85, 0.7)',
                            lineWidth: 1,
                            drawBorder: true,
                            borderColor: '#555555',
                            tickLength: 10,
                            drawTicks: true,
                            offset: false
                        },
                        border: {
                            width: 1,
                            color: '#555555'
                        },
                        ticks: {
                            color: 'white',
                            font: {
                                size: 14,
                                family: 'monospace'
                            },
                            padding: 15
                        },
                        title: {
                            display: true,
                            text: 'Frequency Bands',
                            color: 'white',
                            font: {
                                size: 14,
                                weight: 'bold',
                                family: 'monospace'
                            },
                            padding: {
                                top: 25,
                                bottom: 15
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Multiband RMS Analysis',
                        color: 'white',
                        font: {
                            size: 18,
                            weight: 'bold',
                            family: 'monospace'
                        },
                        padding: {
                            top: 25,
                            bottom: 35
                        }
                    },
                    legend: {
                        position: 'top',
                        align: 'start',
                        labels: {
                            color: 'white',
                            padding: 25,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                size: 14,
                                family: 'monospace'
                            },
                            boxWidth: 12,
                            boxHeight: 12
                        }
                    }
                }
            },
            plugins: [{
                id: 'customBackground',
                beforeDraw: (chart) => {
                    const ctx = chart.canvas.getContext('2d');
                    ctx.save();
                    ctx.fillStyle = '#2b2b2b';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            }]
        });
    }

    // Helper function to generate rainbow colors like Python's plt.cm.rainbow
    function generateRainbowColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i / count) * 360;
            colors.push(`hsl(${hue}, 100%, 50%)`);
        }
        return colors;
    }

    function showProcessingStatus(filename, status) {
        const statusDiv = document.getElementById('status-text');
        if (statusDiv) {
            statusDiv.textContent = status;
        }
    }

    function clearProcessingStatus() {
        const statusDiv = document.getElementById('status-text');
        if (statusDiv) {
            statusDiv.textContent = '';
        }
    }
}); 