// This file is used to interact with the Zebra Browser Print SDK
// It is used to print and generate custom LPNs

//Select the printer
var selected_device;
        var devices = [];
        var isPrinting = false;
        var activePrintJobId = null;
        var activeSentCount = 0;
        var cancelPrintRequested = false;
        var PRINT_CHUNK_SIZE = 5;

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
            var buttonIds = ['print_button', 'custom_print_button'];
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
        * Template for the LPN to be printed on the label and uses the ZPL language
        @param {string} FullLPN - The full LPN to be printed
        */
        function  LPNTemplate(FullLPN){

            //split the LPN display into the first 5 characters after LPN and the last 6 characters
            var FirstFive = FullLPN.substr(3, 5);
            var LastSix = FullLPN.substr(8, 6);

            //ZPL template for the LPN
            var template = '^XA^CF0,40^FO40,30^BY2^BCN,100,N,N,N^FD$FullLPN$^FS^CF0,28^FO45,142^FDLPN $FirstFive$^FS^CF0,58^FO185,132^FD$LastSix$^FS^XZ';

            //replace the placeholders in the template with the LPN
            var dataToWrite = template.replace('$FullLPN$', FullLPN).replace('$FirstFive$', FirstFive).replace('$LastSix$', LastSix);
            return dataToWrite;
        }

        /*
        * Prints a custom LPN entered by the user and checks the status of the printer
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
            console.log("Custom LPN: "  + document.getElementById("customLPN").value);
            var fullLPN = document.getElementById("customLPN").value.toUpperCase();

            //check if the LPN is the correct length if not alert the user
            if(fullLPN.length != 14){
                setPrintStatus("Invalid custom LPN", [
                    "LPN must be exactly 14 characters.",
                    "Entered: " + fullLPN.length + " characters."
                ]);
                alert("Invalid LPN");
                return;
            } else {

                //gets the ZPL code for the LPN and sends it to the printer
                var dataToWrite = LPNTemplate(fullLPN);
                setPrintStatus("Preparing custom label...", [
                    "LPN: " + fullLPN,
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
        function buildLabelBatchZpl(lpns, isFinalBatch) {
            var dataToWrite = '';

            lpns.forEach(function(FullLPN) {
                dataToWrite = dataToWrite + LPNTemplate(FullLPN);
            });

            let firstIndex = dataToWrite.indexOf("^XA^CF0,40^");
            let lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

            if (firstIndex === -1) {
                return dataToWrite;
            }

            if (firstIndex === lastIndex) {
                let insertAfter = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfter) + (isFinalBatch ? "^MMc" : "^MMt") + dataToWrite.substring(insertAfter);
            } else {
                let insertAfterFirst = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfterFirst) + "^MMt" + dataToWrite.substring(insertAfterFirst);

                if(isFinalBatch) {
                    lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

                    let insertAfterLast = lastIndex + 3; 
                    dataToWrite = dataToWrite.substring(0, insertAfterLast) + "^MMc" + dataToWrite.substring(insertAfterLast);
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

        async function writeLabelsToSelectedPrinter(lpns, printJobId) {
            activePrintJobId = printJobId || null;
            activeSentCount = 0;

            var totalLabels = lpns.length;
            var sentLabels = 0;

            for(var start = 0; start < totalLabels; start += PRINT_CHUNK_SIZE) {
                if(cancelPrintRequested) {
                    await updatePrintJobStatus(printJobId, 'canceled', 'Canceled by user from browser', sentLabels);
                    throw new Error("Print canceled by user");
                }

                var end = Math.min(start + PRINT_CHUNK_SIZE, totalLabels);
                var chunk = lpns.slice(start, end);
                var isFinalBatch = end >= totalLabels;
                var dataToWrite = buildLabelBatchZpl(chunk, isFinalBatch);

                setPrintStatus("Sending labels...", [
                    "Printer: " + selectedPrinterName(),
                    "Job: " + printJobId,
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
                "Job: " + printJobId
            ]);
        }

        function writeToSelectedPrinter(dataToWrite, printJobId) {
            activePrintJobId = printJobId || null;
            activeSentCount = 0;

            let firstIndex = dataToWrite.indexOf("^XA^CF0,40^");
            let lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

            if (firstIndex !== -1 && firstIndex === lastIndex) {
                let insertAfter = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfter) + "^MMc" + dataToWrite.substring(insertAfter);
            } else if (firstIndex !== -1) {
                let insertAfterFirst = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfterFirst) + "^MMt" + dataToWrite.substring(insertAfterFirst);

                lastIndex = dataToWrite.lastIndexOf("^XA^CF0,40^");

                let insertAfterLast = lastIndex + 3; 
                dataToWrite = dataToWrite.substring(0, insertAfterLast) + "^MMc" + dataToWrite.substring(insertAfterLast);
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

        
