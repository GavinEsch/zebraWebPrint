// This file is used to interact with the Zebra Browser Print SDK
// It is used to print generated LPNs and admin-entered label values

//Select the printer
var selected_device;
        var devices = [];
        var isPrinting = false;
        var activePrintJobId = null;
        var activeSentCount = 0;
        var cancelPrintRequested = false;
        var PRINT_CHUNK_SIZE = 5;
        var MAX_LABEL_VALUE_LENGTH = 64;
        var MAX_COPY_COUNT = 999;
        var MAX_IMPORT_LABEL_COUNT = 1000;
        var LARGE_IMPORT_CONFIRM_COUNT = 50;
        var IMPORT_PREVIEW_LIMIT = 10;
        var IMPORT_FORMAT_ERROR = "Submit the file in the correct format you fucking idiot";
        var IMPORT_HEADER_NAMES = ['label', 'label value', 'value', 'barcode', 'code', 'sku', 'item', 'lpn', 'full_lpn', 'full lpn'];
        var IMPORT_COPY_HEADER_NAMES = ['copies', 'copy', 'qty', 'quantity', 'count'];
        var IMPORT_TEMPLATE_ROWS = [
            ['label', 'copies'],
            ['AG-32-443', '1'],
            ['ABC-123', '2']
        ];

        function setPrintStatus(message, details) {
            var printStatus = document.getElementById("print_status");
            if(printStatus) {
                printStatus.innerHTML = "";

                var title = document.createElement("strong");
                title.textContent = message;
                printStatus.appendChild(title);

                if(details) {
                    var detailList = Array.isArray(details) ? details : [details];
                    detailList.forEach(function(detail) {
                        if(detail) {
                            printStatus.appendChild(document.createElement("br"));
                            printStatus.appendChild(document.createTextNode(detail));
                        }
                    });
                }
            }
        }

        function selectedPrinterName() {
            return selected_device ? (selected_device.name || selected_device.uid || "Selected printer") : "No printer selected";
        }

        function labelCountFromZpl(dataToWrite) {
            var matches = dataToWrite.match(/\^XA/g);
            return matches ? matches.length : 0;
        }

        function delay(milliseconds) {
            return new Promise((resolve) => setTimeout(resolve, milliseconds));
        }

        function getClientContext() {
            return {
                platform: navigator.platform || '',
                language: navigator.language || '',
                vendor: navigator.vendor || ''
            };
        }

        function setNoPrinterStatus() {
            setPrintStatus("No printer selected", [
                "Choose a Zebra printer from the list.",
                "If the list is empty, check Zebra Browser Print and the printer connection."
            ]);
        }

        function addDeviceOption(device) {
            if(!device) {
                return;
            }

            var html_select = document.getElementById("selected_device");
            if(!html_select) {
                return;
            }

            var option = document.createElement("option");
            option.text = device.name || device.uid || "Unnamed printer";
            option.value = device.uid || "";
            html_select.add(option);
        }

        function loadLocalPrinters() {
            setPrintStatus("Searching for Zebra printers...", "Checking printers available through Zebra Browser Print.");

            BrowserPrint.getLocalDevices(function(device_list){
                var foundPrinters = false;

                for(var i = 0; i < device_list.length; i++)
                {
                    var device = device_list[i];

                    if(!selected_device || device.uid != selected_device.uid)
                    {
                        devices.push(device);
                        addDeviceOption(device);
                    }

                    if(!selected_device) {
                        selected_device = device;
                    }

                    foundPrinters = true;
                }

                if(foundPrinters) {
                    setPrintStatus("Ready to print", [
                        "Printer: " + selectedPrinterName(),
                        "Found " + device_list.length + " printer(s)."
                    ]);
                } else {
                    setPrintStatus("No Zebra printers found", [
                        "Check that Zebra Browser Print is running.",
                        "Confirm the printer is installed and connected."
                    ]);
                }
            }, function(error){
                var message = error || "Unable to get local printers. Check that Zebra Browser Print is installed and running.";
                setPrintStatus("Unable to load printers", message);
                alert(message);
            },"printer");
        }

        function setup()
        {
            setupImportFileSummary();
            setPrintStatus("Connecting to Zebra Browser Print...", "Looking for the default Zebra printer.");

            BrowserPrint.getDefaultDevice("printer", function(device)
                    {

                        selected_device = device;
                        if(device) {
                            devices.push(device);
                            addDeviceOption(device);
                        }
                        
                        //get the list of devices
                        loadLocalPrinters();
                        
                    }, function(error){
                        var message = error || "No default Zebra printer found. Check that Zebra Browser Print is installed and running.";
                        setPrintStatus("No default printer found", [
                            "Looking for other installed Zebra printers.",
                            message
                        ]);
                        loadLocalPrinters();
                    })
        }

        function getCsrfToken() {
            var tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
            return tokenInput ? tokenInput.value : '';
        }

        function setPrintControlsDisabled(isDisabled) {
            var buttonIds = ['print_button', 'custom_print_button', 'import_print_button'];
            buttonIds.forEach(function(buttonId) {
                var button = document.getElementById(buttonId);
                if(button) {
                    button.disabled = isDisabled;
                }
            });
        }

        function setStopButtonDisabled(isDisabled) {
            var button = document.getElementById("stop_printer_button");
            if(button) {
                button.disabled = isDisabled;
            }
        }

        function stopSelectedPrinter() {
            if(!selected_device) {
                setNoPrinterStatus();
                alert("No printer selected");
                return;
            }

            var confirmed = confirm("Stop the selected printer and clear its queued Zebra labels?");
            if(!confirmed) {
                return;
            }

            cancelPrintRequested = true;
            setStopButtonDisabled(true);
            setPrintStatus("Stopping printer...", [
                "Printer: " + selectedPrinterName(),
                "The app will stop sending more labels.",
                "The printer should stop after the current label or buffered labels finish."
            ]);

            return new Promise((resolve, reject) => {
                selected_device.send("~JA", function(){
                    updatePrintJobStatus(activePrintJobId, 'canceled', 'Canceled by user from browser', activeSentCount).finally(function(){
                        activePrintJobId = null;
                        activeSentCount = 0;
                        isPrinting = false;
                        setPrintControlsDisabled(false);
                        setStopButtonDisabled(false);
                        setPrintStatus("Stop command sent", [
                            "Printer: " + selectedPrinterName(),
                            "Queued labels were canceled if they were still in the printer buffer."
                        ]);
                        resolve();
                    });
                }, function(errorMessage){
                    var message = errorMessage || "Unable to send stop command";
                    setStopButtonDisabled(false);
                    setPrintStatus("Unable to stop printer", [
                        "Printer: " + selectedPrinterName(),
                        message
                    ]);
                    alert(message);
                    reject(new Error(message));
                });
            });
        }

        /*
        * Reserve a batch of unique LPNs on the server in one request.
        @param {number} count - The number of LPNs to reserve
        @returns {Promise} - The promise that resolves to the reserved LPNs
        */
        function reserveLPNsFromServer(count) {
            const csrftoken = getCsrfToken();

            return fetch('/api/reserve_lpns/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({
                    count: count,
                    printer_name: selected_device ? selected_device.name : '',
                    client_context: getClientContext()
                })
            })
            .then(response => response.json().then(data => {
                if (!response.ok) {
                    throw new Error(data.message || 'Unable to reserve LPNs');
                }
                return data;
            }))
            .catch(error => {
                console.error('Error:', error);
                return { status: 'error', message: error.message || 'Network error or server not responding' };
            });
        }

        function updatePrintJobStatus(jobId, status, message, sentCount) {
            if(!jobId) {
                return Promise.resolve();
            }

            return fetch('/api/print_jobs/' + jobId + '/status/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    status: status,
                    message: message || '',
                    printer_name: selected_device ? selected_device.name : '',
                    sent_count: sentCount || 0,
                    client_context: getClientContext()
                })
            }).catch(error => {
                console.error('Error updating print job status:', error);
            });
        }

        /*
        * Template for the label value to be printed on the label and uses the ZPL language.
        @param {string} FullLPN - The label value to be printed
        */
        function shouldBoldLastSix() {
            var checkbox = document.getElementById("last_six_bolded");
            return checkbox ? checkbox.checked : false;
        }

        function normalizeLabelValue(value) {
            return String(value || '').trim();
        }

        function isGeneratedLPN(value) {
            return /^LPN[A-Z0-9]{11}$/.test(value);
        }

        function isValidLabelValue(value) {
            return (
                value.length > 0 &&
                value.length <= MAX_LABEL_VALUE_LENGTH &&
                /^[\x20-\x7E]+$/.test(value)
            );
        }

        function zplHexField(value) {
            var encoded = '';
            for(var i = 0; i < value.length; i++) {
                encoded += '_' + value.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
            }
            return encoded;
        }

        function showImportFormatError() {
            setPrintStatus("Invalid import file", IMPORT_FORMAT_ERROR);
            alert(IMPORT_FORMAT_ERROR);
        }

        function  LPNTemplate(FullLPN, options){
            options = options || {};
            var labelValue = normalizeLabelValue(FullLPN);
            var encodedLabelValue = zplHexField(labelValue);

            if(isGeneratedLPN(labelValue) && !options.boldLastSix) {
                var FirstFive = labelValue.substr(3, 5);
                var LastSix = labelValue.substr(8, 6);
                return '^XA^CF0,40^FO40,30^BY2^BCN,100,N,N,N^FH^FD' + encodedLabelValue + '^FS^CF0,28^FO45,142^FH^FD' + zplHexField('LPN ' + FirstFive) + '^FS^CF0,58^FO185,132^FH^FD' + zplHexField(LastSix) + '^FS^XZ';
            }

            var prefix = labelValue.length > 6 ? labelValue.slice(0, -6) : '';
            var lastSix = labelValue.slice(-6);
            var lastSixX = Math.min(420, 45 + (prefix.length * 17));

            var humanReadableZpl = '^CF0,34^FO45,142^FH^FD' + encodedLabelValue + '^FS';
            if(options.boldLastSix) {
                humanReadableZpl = '^CF0,28^FO45,146^FH^FD' + zplHexField(prefix) + '^FS'
                    + '^CF0,52^FO' + lastSixX + ',132^FH^FD' + zplHexField(lastSix) + '^FS'
                    + '^CF0,52^FO' + (lastSixX + 2) + ',132^FH^FD' + zplHexField(lastSix) + '^FS';
            }

            return '^XA^CF0,40^FO40,30^BY2^BCN,100,N,N,N^FH^FD' + encodedLabelValue + '^FS' + humanReadableZpl + '^XZ';
        }

        /*
        * Prints a custom label value entered by the user and checks the status of the printer
        @returns {Promise} - The promise that resolves to true if the printer is ready to print
        */
        async function printCustomLPN(){
            if(isPrinting) {
                return;
            }

            if(!selected_device) {
                setNoPrinterStatus();
                alert("No printer selected");
                return;
            }

            isPrinting = true;
            cancelPrintRequested = false;
            setPrintControlsDisabled(true);

            try {

            //check if the printer is ready, if not it will skip the rest of the function
            var zebraPrinter = new Zebra.Printer(selected_device);
            setPrintStatus("Checking printer...", "Printer: " + selectedPrinterName());
            var tf = await getStatus(zebraPrinter);
            console.log("tf: " + tf);
            if(!tf)  {
                return;
            }
            
            console.log("Selected Device: "+ selected_device.name);
            console.log("Custom label value: "  + document.getElementById("customLPN").value);
            var fullLPN = normalizeLabelValue(document.getElementById("customLPN").value);

            //check if the label value can be safely printed
            if(!isValidLabelValue(fullLPN)){
                setPrintStatus("Invalid custom label", [
                    "Use 1-" + MAX_LABEL_VALUE_LENGTH + " printable characters.",
                    "Entered: " + fullLPN.length + " characters."
                ]);
                alert("Invalid label value");
                return;
            } else {

                //gets the ZPL code for the label value and sends it to the printer
                var dataToWrite = LPNTemplate(fullLPN);
                setPrintStatus("Preparing custom label...", [
                    "Value: " + fullLPN,
                    "Printer: " + selectedPrinterName()
                ]);
            await writeToSelectedPrinter(dataToWrite);
            }
            } catch(error) {
                if(error.message === "Print canceled by user") {
                    setPrintStatus("Print canceled", "The app stopped sending labels to the printer.");
                } else {
                    setPrintStatus("Print failed", error.message || "Unknown print error.");
                    alert(error.message || 'Print failed');
                }
            } finally {
                isPrinting = false;
                setPrintControlsDisabled(false);
            }
        }

        /*
        * Checks the status of the printer
        @switch {string} statusMessage - The status message of the printer
        @param {Zebra.Printer} zebraPrinter - The printer object
        @returns {Promise} - The promise that resolves to true if the printer is ready to print
        */
        function getStatus(zebraPrinter) {
            return new Promise((resolve, reject) => {
                zebraPrinter.getStatus(function(status){
                    var statusMessage = status.getMessage();
                    console.log(statusMessage);

                    //check the status of the printer and alert the user if the printer is not ready
                    switch(statusMessage) {
                        case "Head Open":
                            setPrintStatus("Printer needs attention", [
                                "Printer: " + selectedPrinterName(),
                                "Close the printer head, then try again."
                            ]);
                            alert("Please Close Printer Head");
                            resolve(false);
                            break;
                        case "Paper Out":
                            setPrintStatus("Printer needs media", [
                                "Printer: " + selectedPrinterName(),
                                "Load labels or check the media path, then try again."
                            ]);
                            alert("Please Check Paper");
                            resolve(false);
                            break;
                        case "Paused":
                            setPrintStatus("Printer is paused", [
                                "Printer: " + selectedPrinterName(),
                                "Resume the printer, then try again."
                            ]);
                            alert("Printer Paused. Please Resume");
                            resolve(false);
                            break;
                        default:
                            setPrintStatus("Printer ready", [
                                "Printer: " + selectedPrinterName(),
                                "Status: " + statusMessage
                            ]);
                            resolve(true);
                            break;
                    }
                }, function(error){
                    reject(error); 
                });
            });
        }

        /*
        * Generates the LPNs from the server and gets them ready to send to the printer
        @returns {Promise} - The promise that resolves to the LPNs generated
        */
        async function getLPNs(){
            if(isPrinting) {
                return;
            }

            if(!selected_device) {
                setNoPrinterStatus();
                alert("No printer selected");
                return;
            }

            isPrinting = true;
            cancelPrintRequested = false;
            setPrintControlsDisabled(true);

            try {
            //check if the printer is ready, if not it will skip the rest of the function
            var zebraPrinter = new Zebra.Printer(selected_device);
            var tf;
            try {
                setPrintStatus("Checking printer...", "Printer: " + selectedPrinterName());
                tf = await getStatus(zebraPrinter);
            } catch(error) {
                setPrintStatus("Unable to read printer status", [
                    "Printer: " + selectedPrinterName(),
                    error.message || "Check Zebra Browser Print and the printer connection."
                ]);
                alert("Unable to read printer status");
                return;
            }
            console.log("tf: " + tf);
            if(!tf)  {
                return;
            }

            console.log("Selected Device: "+ selected_device.name);

            var LPNcount = document.getElementById("LPNquantity");
            var numberOfLPNs = parseInt(LPNcount.value);

            console.log("Number of LPNs: " + numberOfLPNs);

            let LPNs = [];
            setPrintStatus("Reserving labels...", [
                "Count: " + numberOfLPNs,
                "Printer: " + selectedPrinterName()
            ]);
            
            let response = await reserveLPNsFromServer(numberOfLPNs);
            if (response.status !== 'success') {
                setPrintStatus("Unable to reserve labels", response.message);
                alert(response.message);
                return;
            }

            LPNs = response.lpns;
            activePrintJobId = response.job_id;
            setPrintStatus("Labels reserved", [
                "Job: " + response.job_id,
                "Count: " + LPNs.length
            ]);

            await writeLabelsToSelectedPrinter(LPNs, response.job_id);
            } catch(error) {
                if(error.message === "Print canceled by user") {
                    setPrintStatus("Print canceled", [
                        "Printer: " + selectedPrinterName(),
                        "The app stopped sending the remaining labels."
                    ]);
                } else {
                    setPrintStatus("Print failed", error.message || "Unknown print error.");
                    alert(error.message || 'Print failed');
                }
            } finally {
                isPrinting = false;
                setPrintControlsDisabled(false);
            }

        }

        /*
        * Writes the data to the selected printer
        @param {string} dataToWrite - The data to be written to the printer
        */
        function buildLabelBatchZpl(lpns, isFinalBatch, options) {
            var dataToWrite = '';

            lpns.forEach(function(FullLPN) {
                dataToWrite = dataToWrite + LPNTemplate(FullLPN, options);
            });

            let firstIndex = dataToWrite.indexOf("^XA^CF0,40^");
            let lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

            if (firstIndex === -1) {
                return dataToWrite;
            }

            if (firstIndex === lastIndex) {
                let insertAfter = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfter) + (isFinalBatch ? "^MMC" : "^MMT") + dataToWrite.substring(insertAfter);
            } else {
                let insertAfterFirst = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfterFirst) + "^MMT" + dataToWrite.substring(insertAfterFirst);

                if(isFinalBatch) {
                    lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

                    let insertAfterLast = lastIndex + 3; 
                    dataToWrite = dataToWrite.substring(0, insertAfterLast) + "^MMC" + dataToWrite.substring(insertAfterLast);
                }
            }

            return dataToWrite;
        }

        function sendRawToSelectedPrinter(dataToWrite) {
            return new Promise((resolve, reject) => {
                selected_device.send(dataToWrite, function(){
                    resolve();
                }, function(errorMessage){
                    reject(new Error(errorMessage || 'Printer send failed'));
                });
            });
        }

        async function writeLabelsToSelectedPrinter(lpns, printJobId, options) {
            activePrintJobId = printJobId || null;
            activeSentCount = 0;
            options = options || {};

            var totalLabels = lpns.length;
            var sentLabels = 0;
            var jobLine = printJobId ? "Job: " + printJobId : (options.sourceName || "Imported labels");

            for(var start = 0; start < totalLabels; start += PRINT_CHUNK_SIZE) {
                if(cancelPrintRequested) {
                    await updatePrintJobStatus(printJobId, 'canceled', 'Canceled by user from browser', sentLabels);
                    throw new Error("Print canceled by user");
                }

                var end = Math.min(start + PRINT_CHUNK_SIZE, totalLabels);
                var chunk = lpns.slice(start, end);
                var isFinalBatch = end >= totalLabels;
                var dataToWrite = buildLabelBatchZpl(chunk, isFinalBatch, options);

                setPrintStatus("Sending labels...", [
                    "Printer: " + selectedPrinterName(),
                    jobLine,
                    "Sending " + (start + 1) + "-" + end + " of " + totalLabels,
                    "Stop Printer will cancel labels that have not been sent yet."
                ]);

                try {
                    await sendRawToSelectedPrinter(dataToWrite);
                } catch(error) {
                    await updatePrintJobStatus(printJobId, 'failed', error.message || 'Printer send failed', sentLabels);
                    throw error;
                }

                sentLabels = end;
                activeSentCount = sentLabels;
                await delay(100);
            }

            await updatePrintJobStatus(printJobId, 'sent', '', sentLabels);
            activePrintJobId = null;
            activeSentCount = 0;
            cancelPrintRequested = false;
            setPrintStatus("Print job sent", [
                "Printer: " + selectedPrinterName(),
                "Labels: " + sentLabels,
                jobLine
            ]);
        }

        function parseCsvRows(text) {
            var rows = [];
            var row = [];
            var value = '';
            var inQuotes = false;

            for(var i = 0; i < text.length; i++) {
                var character = text[i];
                var nextCharacter = text[i + 1];

                if(character === '"' && inQuotes && nextCharacter === '"') {
                    value += '"';
                    i++;
                } else if(character === '"') {
                    inQuotes = !inQuotes;
                } else if(character === ',' && !inQuotes) {
                    row.push(value);
                    value = '';
                } else if((character === '\n' || character === '\r') && !inQuotes) {
                    if(character === '\r' && nextCharacter === '\n') {
                        i++;
                    }
                    row.push(value);
                    rows.push(row);
                    row = [];
                    value = '';
                } else {
                    value += character;
                }
            }

            row.push(value);
            rows.push(row);

            return rows.filter(function(currentRow) {
                return currentRow.some(function(cell) {
                    return String(cell || '').trim() !== '';
                });
            });
        }

        function parseCopyCount(value) {
            if(value === null || value === undefined || String(value).trim() === '') {
                return 1;
            }

            var text = String(value).trim();
            if(!/^\d+$/.test(text)) {
                return null;
            }

            var copyCount = parseInt(text, 10);
            if(copyCount < 1 || copyCount > MAX_COPY_COUNT) {
                return null;
            }

            return copyCount;
        }

        function findImportColumns(rows) {
            if(!rows.length) {
                return null;
            }

            var header = rows[0].map(function(cell) {
                return String(cell || '').trim().toLowerCase();
            });
            var valueHeaderIndex = header.findIndex(function(cell) {
                return IMPORT_HEADER_NAMES.indexOf(cell) !== -1;
            });
            var copyHeaderIndex = header.findIndex(function(cell) {
                return IMPORT_COPY_HEADER_NAMES.indexOf(cell) !== -1;
            });
            if(valueHeaderIndex !== -1) {
                return {
                    valueIndex: valueHeaderIndex,
                    copyIndex: copyHeaderIndex,
                    hasHeader: true
                };
            }

            var populatedColumns = [];
            rows.forEach(function(row) {
                row.forEach(function(cell, index) {
                    if(String(cell || '').trim() !== '' && populatedColumns.indexOf(index) === -1) {
                        populatedColumns.push(index);
                    }
                });
            });

            if(populatedColumns.length === 1) {
                return {
                    valueIndex: populatedColumns[0],
                    copyIndex: -1,
                    hasHeader: false
                };
            }

            if(populatedColumns.length === 2) {
                return {
                    valueIndex: populatedColumns[0],
                    copyIndex: populatedColumns[1],
                    hasHeader: false
                };
            }

            return null;
        }

        function summarizeDuplicateValues(rows) {
            var counts = {};
            rows.forEach(function(row) {
                counts[row.value] = (counts[row.value] || 0) + 1;
            });

            return Object.keys(counts).filter(function(value) {
                return counts[value] > 1;
            });
        }

        function expandImportRows(rows) {
            var labels = [];
            rows.forEach(function(row) {
                for(var i = 0; i < row.copies; i++) {
                    labels.push(row.value);
                }
            });
            return labels;
        }

        function extractImportDataFromRows(rows) {
            var columns = findImportColumns(rows);
            if(!columns) {
                throw new Error(IMPORT_FORMAT_ERROR);
            }

            var dataRows = columns.hasHeader ? rows.slice(1) : rows;
            var parsedRows = [];

            dataRows.forEach(function(row) {
                var labelValue = normalizeLabelValue(row[columns.valueIndex]);
                if(labelValue === '') {
                    return;
                }

                var copyCount = columns.copyIndex === -1 ? 1 : parseCopyCount(row[columns.copyIndex]);
                if(!isValidLabelValue(labelValue) || copyCount === null) {
                    throw new Error(IMPORT_FORMAT_ERROR);
                }

                parsedRows.push({
                    value: labelValue,
                    copies: copyCount
                });
            });

            if(!parsedRows.length) {
                throw new Error(IMPORT_FORMAT_ERROR);
            }

            var labels = expandImportRows(parsedRows);
            if(labels.length > MAX_IMPORT_LABEL_COUNT) {
                throw new Error("This file expands to " + labels.length + " labels. Keep each import at " + MAX_IMPORT_LABEL_COUNT + " labels or fewer.");
            }

            return {
                rows: parsedRows,
                labels: labels,
                totalRows: parsedRows.length,
                totalLabels: labels.length,
                duplicateValues: summarizeDuplicateValues(parsedRows)
            };
        }

        async function readImportFileRows(file) {
            var extension = file.name.split('.').pop().toLowerCase();

            if(extension === 'csv') {
                var text = await file.text();
                return parseCsvRows(text);
            }

            if(extension === 'xlsx' || extension === 'xls') {
                if(typeof XLSX === 'undefined') {
                    throw new Error("XLSX parser failed to load. Check the network connection and try again.");
                }

                var data = await file.arrayBuffer();
                var workbook = XLSX.read(data, { type: 'array' });
                var firstSheetName = workbook.SheetNames[0];
                if(!firstSheetName) {
                    throw new Error(IMPORT_FORMAT_ERROR);
                }
                return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header: 1, defval: '' });
            }

            throw new Error(IMPORT_FORMAT_ERROR);
        }

        async function parseImportFile(file) {
            var rows = await readImportFileRows(file);
            return extractImportDataFromRows(rows);
        }

        function csvCell(value) {
            var text = String(value);
            if(/[",\r\n]/.test(text)) {
                return '"' + text.replace(/"/g, '""') + '"';
            }
            return text;
        }

        function templateRowsToCsv() {
            return IMPORT_TEMPLATE_ROWS.map(function(row) {
                return row.map(csvCell).join(',');
            }).join('\r\n') + '\r\n';
        }

        function downloadTextFile(filename, content, type) {
            var blob = new Blob([content], { type: type });
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        function downloadImportCsvTemplate() {
            downloadTextFile('label-import-template.csv', templateRowsToCsv(), 'text/csv;charset=utf-8');
        }

        function downloadImportXlsxTemplate() {
            if(typeof XLSX === 'undefined') {
                alert("XLSX template download is unavailable. Use the CSV template instead.");
                return;
            }

            var worksheet = XLSX.utils.aoa_to_sheet(IMPORT_TEMPLATE_ROWS);
            var workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Labels');
            XLSX.writeFile(workbook, 'label-import-template.xlsx');
        }

        function setImportFileSummary(message) {
            var summary = document.getElementById("import_file_summary");
            if(summary) {
                summary.textContent = message;
            }
        }

        function clearImportPreview() {
            var preview = document.getElementById("import_preview");
            if(!preview) {
                return;
            }

            preview.hidden = true;
            preview.innerHTML = '';
        }

        function renderImportPreview(importData, fileName) {
            var preview = document.getElementById("import_preview");
            if(!preview) {
                return;
            }

            preview.innerHTML = '';
            preview.hidden = false;

            var title = document.createElement('strong');
            title.textContent = 'Preview';
            preview.appendChild(title);

            var summary = document.createElement('p');
            summary.textContent = importData.totalRows + ' row(s), ' + importData.totalLabels + ' label(s), file: ' + fileName;
            preview.appendChild(summary);

            if(importData.duplicateValues.length) {
                var duplicateWarning = document.createElement('p');
                duplicateWarning.className = 'import-preview-warning';
                duplicateWarning.textContent = 'Duplicate values found: ' + importData.duplicateValues.slice(0, 5).join(', ') + (importData.duplicateValues.length > 5 ? ' and ' + (importData.duplicateValues.length - 5) + ' more' : '');
                preview.appendChild(duplicateWarning);
            }

            var list = document.createElement('ul');
            importData.rows.slice(0, IMPORT_PREVIEW_LIMIT).forEach(function(row) {
                var item = document.createElement('li');
                item.textContent = row.value + (row.copies > 1 ? ' x ' + row.copies : '');
                list.appendChild(item);
            });
            preview.appendChild(list);

            if(importData.rows.length > IMPORT_PREVIEW_LIMIT) {
                var remaining = document.createElement('p');
                remaining.textContent = 'And ' + (importData.rows.length - IMPORT_PREVIEW_LIMIT) + ' more row(s).';
                preview.appendChild(remaining);
            }
        }

        function setupImportFileSummary() {
            var fileInput = document.getElementById("lpn_import_file");
            if(!fileInput) {
                return;
            }

            fileInput.addEventListener("change", async function() {
                var file = fileInput.files && fileInput.files[0];
                if(!file) {
                    setImportFileSummary("No file selected.");
                    clearImportPreview();
                    return;
                }

                try {
                    var importData = await parseImportFile(file);
                    setImportFileSummary("Ready: " + importData.totalLabels + " label(s) from " + importData.totalRows + " row(s).");
                    renderImportPreview(importData, file.name);
                } catch(error) {
                    setImportFileSummary("Invalid file selected.");
                    clearImportPreview();
                }
            });
        }

        function confirmImportPrint(importData) {
            var messages = [];

            if(importData.totalLabels >= LARGE_IMPORT_CONFIRM_COUNT) {
                messages.push("Print " + importData.totalLabels + " labels?");
            }

            if(importData.duplicateValues.length) {
                messages.push("Duplicate values found: " + importData.duplicateValues.slice(0, 8).join(', ') + (importData.duplicateValues.length > 8 ? " and " + (importData.duplicateValues.length - 8) + " more" : ""));
            }

            if(!messages.length) {
                return true;
            }

            return confirm(messages.join("\n\n") + "\n\nContinue?");
        }

        async function printImportedLPNs() {
            if(isPrinting) {
                return;
            }

            if(!selected_device) {
                setNoPrinterStatus();
                alert("No printer selected");
                return;
            }

            var fileInput = document.getElementById("lpn_import_file");
            var file = fileInput && fileInput.files ? fileInput.files[0] : null;
            if(!file) {
                showImportFormatError();
                return;
            }

            isPrinting = true;
            cancelPrintRequested = false;
            setPrintControlsDisabled(true);

            try {
                setPrintStatus("Reading import file...", file.name);
                var importData = await parseImportFile(file);
                renderImportPreview(importData, file.name);

                if(!confirmImportPrint(importData)) {
                    setPrintStatus("Import print canceled", "No labels were sent to the printer.");
                    return;
                }

                var zebraPrinter = new Zebra.Printer(selected_device);
                setPrintStatus("Checking printer...", "Printer: " + selectedPrinterName());
                var printerReady = await getStatus(zebraPrinter);
                if(!printerReady) {
                    return;
                }

                setPrintStatus("Printing imported labels...", [
                    "File: " + file.name,
                    "Labels: " + importData.totalLabels,
                    "Printer: " + selectedPrinterName()
                ]);
                await writeLabelsToSelectedPrinter(importData.labels, null, {
                    boldLastSix: shouldBoldLastSix(),
                    sourceName: "File: " + file.name
                });
            } catch(error) {
                if(error.message === IMPORT_FORMAT_ERROR) {
                    showImportFormatError();
                } else if(error.message === "Print canceled by user") {
                    setPrintStatus("Print canceled", "The app stopped sending the remaining labels.");
                } else {
                    setPrintStatus("Import print failed", error.message || "Unknown import print error.");
                    alert(error.message || 'Import print failed');
                }
            } finally {
                isPrinting = false;
                setPrintControlsDisabled(false);
            }
        }

        function writeToSelectedPrinter(dataToWrite, printJobId) {
            activePrintJobId = printJobId || null;
            activeSentCount = 0;

            let firstIndex = dataToWrite.indexOf("^XA^CF0,40^");
            let lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

            if (firstIndex !== -1 && firstIndex === lastIndex) {
                let insertAfter = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfter) + "^MMC" + dataToWrite.substring(insertAfter);
            } else if (firstIndex !== -1) {
                let insertAfterFirst = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfterFirst) + "^MMT" + dataToWrite.substring(insertAfterFirst);

                lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

                let insertAfterLast = lastIndex + 3; 
                dataToWrite = dataToWrite.substring(0, insertAfterLast) + "^MMC" + dataToWrite.substring(insertAfterLast);
            }
            setPrintStatus("Sending to printer...", [
                "Printer: " + selectedPrinterName(),
                "Labels: " + labelCountFromZpl(dataToWrite),
                printJobId ? "Job: " + printJobId : "Custom print"
            ]);

            return new Promise((resolve, reject) => {
                selected_device.send(dataToWrite, function(){
                    var sentCount = labelCountFromZpl(dataToWrite);
                    updatePrintJobStatus(printJobId, 'sent', '', sentCount).finally(function(){
                        activePrintJobId = null;
                        activeSentCount = 0;
                        setPrintStatus("Print job sent", [
                            "Printer: " + selectedPrinterName(),
                            "Labels: " + sentCount,
                            printJobId ? "Job: " + printJobId : "Custom print"
                        ]);
                        resolve();
                    });
                }, function(errorMessage){
                    var message = errorMessage || 'Printer send failed';
                    updatePrintJobStatus(printJobId, 'failed', message, activeSentCount).finally(function(){
                        activePrintJobId = null;
                        activeSentCount = 0;
                        setPrintStatus("Printer send failed", [
                            "Printer: " + selectedPrinterName(),
                            message
                        ]);
                        reject(new Error(message));
                    });
                });
            });
        }

        /*
        * Gets the device list
        @param {array} deviceList - The list of devices
        @returns {Promise} - The promise that resolves to the device list
        */
        function onDeviceSelected(selected)
        {
            for(var i = 0; i < devices.length; ++i){
                if(selected.value == devices[i].uid)
                {
                    selected_device = devices[i];
                    setPrintStatus("Printer selected", "Printer: " + selectedPrinterName());
                    return;
                }
            }
            var zebraPrinter = new Zebra.Printer(selected_device);
            zebraPrinter.getStatus(function(status){
                var statusMessage = status.getMessage();
                console.log(statusMessage);
                setPrintStatus("Printer status", [
                    "Printer: " + selectedPrinterName(),
                    "Status: " + statusMessage
                ]);
            }, function(error){});
        }
        window.onload = setup;

        
