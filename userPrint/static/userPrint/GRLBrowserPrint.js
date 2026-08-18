// This file is used to interact with the Zebra Browser Print SDK
// It is used to print generated LPNs and admin-entered label values

//Select the printer
var selected_device;
var selected_import_device;
var active_print_device;
var allowed_printers = [];
        var devices = [];
        var discovered_devices = [];
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

        function deviceSearchText(device) {
            var searchableValues = [];
            ['uid', 'name', 'connection', 'deviceType', 'manufacturer', 'provider'].forEach(function(key) {
                if(device[key]) {
                    searchableValues.push(String(device[key]));
                }
            });

            try {
                searchableValues.push(JSON.stringify(device));
            } catch(error) {}

            return searchableValues.join(' ');
        }

        function deviceMatchesPrinterIp(device, ipAddress) {
            return !!(device && ipAddress && deviceSearchText(device).indexOf(ipAddress) !== -1);
        }

        function extractDeviceIp(device) {
            if(!device) {
                return '';
            }

            var match = deviceSearchText(device).match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
            return match ? match[0] : '';
        }

        function enabledAllowedPrinters() {
            return allowed_printers.filter(function(printer) {
                return printer.enabled;
            });
        }

        function configuredPrinterForDevice(device) {
            return enabledAllowedPrinters().find(function(printer) {
                return deviceMatchesPrinterIp(device, printer.allowed_ip);
            }) || null;
        }

        function deviceAllowedForPrinting(device) {
            return !!configuredPrinterForDevice(device);
        }

        function deviceDisplayName(device) {
            if(!device) {
                return "No printer selected";
            }
            var configuredPrinter = configuredPrinterForDevice(device);
            if(configuredPrinter) {
                return configuredPrinter.display_name;
            }
            return device.name || device.uid || "Selected printer";
        }

        function selectedPrinterName(device) {
            return deviceDisplayName(device || selected_device);
        }

        function selectedImportPrinterName() {
            return deviceDisplayName(selected_import_device);
        }

        function printerNameForJob(device) {
            return device ? deviceDisplayName(device) : '';
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

        function setNoPrinterStatus(details) {
            setPrintStatus("No printer selected", [
                details || "Choose a Zebra printer from the list.",
                "If the list is empty, check Zebra Browser Print and the printer connection."
            ]);
        }

        function deviceOptionValue(device) {
            return device ? (device.uid || device.name || '') : '';
        }

        function rememberDiscoveredDevice(device) {
            if(!device) {
                return;
            }

            var optionValue = deviceOptionValue(device);
            var existingDevice = discovered_devices.find(function(discoveredDevice) {
                return deviceOptionValue(discoveredDevice) === optionValue;
            });
            if(!existingDevice) {
                discovered_devices.push(device);
            }
        }

        function clearDeviceOptions(selectId) {
            var html_select = document.getElementById(selectId);
            if(!html_select) {
                return;
            }

            while(html_select.options.length) {
                html_select.remove(0);
            }
        }

        function selectDeviceInDropdown(selectId, device) {
            var html_select = document.getElementById(selectId);
            if(html_select && device) {
                html_select.value = deviceOptionValue(device);
            }
        }

        function findDeviceByOptionValue(optionValue) {
            return devices.find(function(device) {
                return deviceOptionValue(device) === optionValue;
            }) || null;
        }

        function refreshPrinterSelects() {
            var previousSelectedValue = selected_device ? deviceOptionValue(selected_device) : '';
            var previousImportValue = selected_import_device ? deviceOptionValue(selected_import_device) : '';

            devices = discovered_devices.filter(deviceAllowedForPrinting);
            clearDeviceOptions("selected_device");
            clearDeviceOptions("import_selected_device");
            devices.forEach(addDeviceOption);

            selected_device = findDeviceByOptionValue(previousSelectedValue) || devices[0] || null;
            selected_import_device = findDeviceByOptionValue(previousImportValue) || selected_device || null;

            selectDeviceInDropdown("selected_device", selected_device);
            selectDeviceInDropdown("import_selected_device", selected_import_device);
            renderPrinterManagement();
        }

        function addDeviceOptionToSelect(selectId, device) {
            var html_select = document.getElementById(selectId);
            if(!html_select) {
                return;
            }

            var optionValue = deviceOptionValue(device);
            var existingOption = Array.prototype.find.call(html_select.options, function(option) {
                return option.value === optionValue;
            });
            if(existingOption) {
                return;
            }

            var option = document.createElement("option");
            option.text = deviceDisplayName(device);
            option.value = optionValue;
            html_select.add(option);
        }

        function addDeviceOption(device) {
            if(!device) {
                return;
            }

            addDeviceOptionToSelect("selected_device", device);
            addDeviceOptionToSelect("import_selected_device", device);
        }

        function loadLocalPrinters() {
            setPrintStatus("Searching for Zebra printers...", "Checking printers available through Zebra Browser Print.");

            BrowserPrint.getLocalDevices(function(device_list){
                for(var i = 0; i < device_list.length; i++)
                {
                    rememberDiscoveredDevice(device_list[i]);
                }
                refreshPrinterSelects();

                if(devices.length) {
                    setPrintStatus("Ready to print", [
                        "Printer: " + selectedPrinterName(),
                        "Found " + devices.length + " enabled configured printer(s)."
                    ]);
                } else if(enabledAllowedPrinters().length) {
                    setPrintStatus("Configured printers not found", [
                        "Browser Print found " + device_list.length + " printer(s), but none matched an enabled configured IP.",
                        "Use Printer Management on the admin page to add or edit allowed printers."
                    ]);
                } else {
                    setPrintStatus("No enabled printers configured", [
                        "Use Printer Management on the admin page to enable printers before printing.",
                        "Browser Print found " + device_list.length + " local printer(s)."
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
            setupPrinterManagement();
            setPrintStatus("Connecting to Zebra Browser Print...", "Looking for the default Zebra printer.");

            loadAllowedPrinters().finally(function() {
                BrowserPrint.getDefaultDevice("printer", function(device)
                    {

                        if(device) {
                            rememberDiscoveredDevice(device);
                            refreshPrinterSelects();
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
                    });
            });
        }

        function getCsrfToken() {
            var tokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
            return tokenInput ? tokenInput.value : '';
        }

        function applyAllowedPrinters(data) {
            allowed_printers = Array.isArray(data && data.printers) ? data.printers : [];
            renderPrinterManagement();
            refreshPrinterSelects();
        }

        function loadAllowedPrinters() {
            return fetch('/api/printers/')
                .then(response => response.json().then(data => {
                    if(!response.ok) {
                        throw new Error(data.message || 'Unable to load allowed printers');
                    }
                    applyAllowedPrinters(data);
                    return data;
                }))
                .catch(error => {
                    console.error('Unable to load allowed printers:', error);
                    applyAllowedPrinters({ printers: [] });
                    return { printers: [] };
                });
        }

        function updatePrinterManagementSummary(message) {
            var summary = document.getElementById("printer_management_summary");
            if(summary) {
                summary.textContent = message;
            }
        }

        function setupPrinterManagement() {
            clearAllowedPrinterForm();
            renderPrinterManagement();
        }

        function clearAllowedPrinterForm() {
            var idInput = document.getElementById("managed_printer_id");
            var ipInput = document.getElementById("managed_printer_ip");
            var nameInput = document.getElementById("managed_printer_name");
            var enabledInput = document.getElementById("managed_printer_enabled");
            var saveButton = document.getElementById("managed_printer_save_button");
            if(idInput) {
                idInput.value = '';
            }
            if(ipInput) {
                ipInput.value = '';
            }
            if(nameInput) {
                nameInput.value = '';
            }
            if(enabledInput) {
                enabledInput.checked = true;
            }
            if(saveButton) {
                saveButton.value = 'Save';
            }
        }

        function editAllowedPrinter(printerId) {
            var printer = allowed_printers.find(function(currentPrinter) {
                return String(currentPrinter.id) === String(printerId);
            });
            if(!printer) {
                return;
            }

            var idInput = document.getElementById("managed_printer_id");
            var ipInput = document.getElementById("managed_printer_ip");
            var nameInput = document.getElementById("managed_printer_name");
            var enabledInput = document.getElementById("managed_printer_enabled");
            var saveButton = document.getElementById("managed_printer_save_button");
            if(idInput) {
                idInput.value = printer.id;
            }
            if(ipInput) {
                ipInput.value = printer.allowed_ip;
            }
            if(nameInput) {
                nameInput.value = printer.display_name;
            }
            if(enabledInput) {
                enabledInput.checked = !!printer.is_enabled;
            }
            if(saveButton) {
                saveButton.value = 'Update';
            }
            updatePrinterManagementSummary("Editing " + printer.display_name + ".");
        }

        function saveAllowedPrinterFromForm() {
            var idInput = document.getElementById("managed_printer_id");
            var ipInput = document.getElementById("managed_printer_ip");
            var nameInput = document.getElementById("managed_printer_name");
            var enabledInput = document.getElementById("managed_printer_enabled");
            var printerId = idInput ? idInput.value.trim() : '';
            var allowedIp = ipInput ? ipInput.value.trim() : '';
            var displayName = nameInput ? nameInput.value.trim() : '';
            var isEnabled = enabledInput ? enabledInput.checked : true;

            if(!allowedIp || !displayName) {
                setPrintStatus("Printer setup incomplete", "Enter both a printer IP and display name.");
                alert("Enter both a printer IP and display name.");
                return;
            }

            return saveAllowedPrinter({
                id: printerId,
                allowed_ip: allowedIp,
                display_name: displayName,
                is_enabled: isEnabled
            }, true);
        }

        function saveDiscoveredPrinter(discoveredIndex) {
            var device = discovered_devices[discoveredIndex];
            if(!device) {
                return;
            }

            var ipInput = document.getElementById("discovered_printer_ip_" + discoveredIndex);
            var nameInput = document.getElementById("discovered_printer_name_" + discoveredIndex);
            var enabledInput = document.getElementById("discovered_printer_enabled_" + discoveredIndex);
            var allowedIp = ipInput ? ipInput.value.trim() : extractDeviceIp(device);
            var displayName = nameInput ? nameInput.value.trim() : deviceDisplayName(device);
            var isEnabled = enabledInput ? enabledInput.checked : true;

            if(!allowedIp || !displayName) {
                setPrintStatus("Discovered printer needs details", "Enter the printer IP and display name before saving.");
                alert("Enter the printer IP and display name before saving.");
                return;
            }

            return saveAllowedPrinter({
                allowed_ip: allowedIp,
                display_name: displayName,
                is_enabled: isEnabled
            }, false);
        }

        function setAllowedPrinterEnabled(printerId, isEnabled) {
            var printer = allowed_printers.find(function(currentPrinter) {
                return String(currentPrinter.id) === String(printerId);
            });
            if(!printer) {
                return;
            }

            return saveAllowedPrinter({
                id: printer.id,
                allowed_ip: printer.allowed_ip,
                display_name: printer.display_name,
                is_enabled: isEnabled
            }, false);
        }

        function deleteAllowedPrinter(printerId) {
            var printer = allowed_printers.find(function(currentPrinter) {
                return String(currentPrinter.id) === String(printerId);
            });
            if(!printer) {
                return;
            }

            var confirmed = confirm("Remove " + printer.display_name + " from the allowed printer list?");
            if(!confirmed) {
                return;
            }

            updatePrinterManagementSummary("Removing printer...");
            return fetch('/api/printers/' + printer.id + '/delete/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({})
            })
            .then(response => response.json().then(data => {
                if(!response.ok) {
                    throw new Error(data.message || 'Unable to remove printer');
                }
                return loadAllowedPrinters().then(function() {
                    clearAllowedPrinterForm();
                    setPrintStatus("Printer removed", data.message || "Printer removed.");
                    updatePrinterManagementSummary("Allowed printers updated.");
                    return data;
                });
            }))
            .catch(error => {
                setPrintStatus("Unable to remove printer", error.message || "Unknown error.");
                alert(error.message || 'Unable to remove printer');
            });
        }

        function saveAllowedPrinter(payload, clearFormAfterSave) {
            updatePrinterManagementSummary("Saving printer...");
            return fetch('/api/printers/save/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(payload)
            })
            .then(response => response.json().then(data => {
                if(!response.ok) {
                    throw new Error(data.message || 'Unable to save printer');
                }
                return loadAllowedPrinters().then(function() {
                    if(clearFormAfterSave) {
                        clearAllowedPrinterForm();
                    }
                    setPrintStatus("Printer saved", data.printer.display_name + " at " + data.printer.allowed_ip + ".");
                    updatePrinterManagementSummary("Allowed printers updated.");
                    return data;
                });
            }))
            .catch(error => {
                renderPrinterManagement();
                setPrintStatus("Unable to save printer", error.message || "Unknown error.");
                alert(error.message || 'Unable to save printer');
            });
        }

        function createPrinterRow(title, metaLines, actions) {
            var row = document.createElement('div');
            row.className = 'printer-row';

            var rowTitle = document.createElement('p');
            rowTitle.className = 'printer-row-title';
            rowTitle.textContent = title;
            row.appendChild(rowTitle);

            metaLines.forEach(function(metaLine) {
                if(metaLine) {
                    var meta = document.createElement('p');
                    meta.className = 'printer-row-meta';
                    meta.textContent = metaLine;
                    row.appendChild(meta);
                }
            });

            if(actions) {
                row.appendChild(actions);
            }

            return row;
        }

        function createEmptyPrinterMessage(message) {
            var empty = document.createElement('p');
            empty.className = 'printer-management-empty';
            empty.textContent = message;
            return empty;
        }

        function renderAllowedPrinterList() {
            var list = document.getElementById("allowed_printer_list");
            if(!list) {
                return;
            }

            list.innerHTML = '';
            if(!allowed_printers.length) {
                list.appendChild(createEmptyPrinterMessage("No allowed printers yet."));
                return;
            }

            allowed_printers.forEach(function(printer) {
                var actions = document.createElement('div');
                actions.className = 'printer-row-actions';

                var enabledLabel = document.createElement('label');
                enabledLabel.className = 'inline-option compact-inline-option';
                var enabledCheckbox = document.createElement('input');
                enabledCheckbox.type = 'checkbox';
                enabledCheckbox.checked = !!printer.is_enabled;
                enabledCheckbox.onchange = function() {
                    setAllowedPrinterEnabled(printer.id, enabledCheckbox.checked);
                };
                enabledLabel.appendChild(enabledCheckbox);
                enabledLabel.appendChild(document.createTextNode('Enabled'));
                actions.appendChild(enabledLabel);

                var editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'secondary';
                editButton.textContent = 'Edit';
                editButton.onclick = function() {
                    editAllowedPrinter(printer.id);
                };
                actions.appendChild(editButton);

                var removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'remove-printer-button';
                removeButton.textContent = 'Remove';
                removeButton.onclick = function() {
                    deleteAllowedPrinter(printer.id);
                };
                actions.appendChild(removeButton);

                list.appendChild(createPrinterRow(
                    printer.display_name,
                    [
                        "IP: " + printer.allowed_ip,
                        printer.enabled ? "Visible to users" : "Hidden from users"
                    ],
                    actions
                ));
            });
        }

        function renderDiscoveredPrinterList() {
            var list = document.getElementById("discovered_printer_list");
            if(!list) {
                return;
            }

            list.innerHTML = '';
            if(!discovered_devices.length) {
                list.appendChild(createEmptyPrinterMessage("No printers discovered on this workstation yet."));
                return;
            }

            discovered_devices.forEach(function(device, index) {
                var detectedIp = extractDeviceIp(device);
                var rawName = device.name || device.uid || "Unnamed printer";
                var configuredPrinter = allowed_printers.find(function(printer) {
                    return detectedIp && printer.allowed_ip === detectedIp;
                });

                var actions = document.createElement('div');
                actions.className = 'printer-row-actions';

                var ipInput = document.createElement('input');
                ipInput.id = 'discovered_printer_ip_' + index;
                ipInput.type = 'text';
                ipInput.placeholder = 'Printer IP';
                ipInput.value = configuredPrinter ? configuredPrinter.allowed_ip : detectedIp;
                ipInput.inputMode = 'numeric';
                actions.appendChild(ipInput);

                var nameInput = document.createElement('input');
                nameInput.id = 'discovered_printer_name_' + index;
                nameInput.type = 'text';
                nameInput.placeholder = 'Display name';
                nameInput.value = configuredPrinter ? configuredPrinter.display_name : rawName;
                actions.appendChild(nameInput);

                var enabledLabel = document.createElement('label');
                enabledLabel.className = 'inline-option compact-inline-option';
                var enabledCheckbox = document.createElement('input');
                enabledCheckbox.id = 'discovered_printer_enabled_' + index;
                enabledCheckbox.type = 'checkbox';
                enabledCheckbox.checked = configuredPrinter ? !!configuredPrinter.is_enabled : true;
                enabledLabel.appendChild(enabledCheckbox);
                enabledLabel.appendChild(document.createTextNode('Enabled'));
                actions.appendChild(enabledLabel);

                var saveButton = document.createElement('button');
                saveButton.type = 'button';
                saveButton.textContent = configuredPrinter ? 'Update' : 'Allow';
                saveButton.onclick = function() {
                    saveDiscoveredPrinter(index);
                };
                actions.appendChild(saveButton);

                list.appendChild(createPrinterRow(
                    rawName,
                    [
                        detectedIp ? "Detected IP: " + detectedIp : "No IP detected automatically.",
                        configuredPrinter ? "Configured as: " + configuredPrinter.display_name : "Not configured yet.",
                        "Browser Print ID: " + deviceOptionValue(device)
                    ],
                    actions
                ));
            });
        }

        function renderPrinterManagement() {
            renderAllowedPrinterList();
            renderDiscoveredPrinterList();
            var enabledCount = enabledAllowedPrinters().length;
            if(allowed_printers.length) {
                updatePrinterManagementSummary(enabledCount + " of " + allowed_printers.length + " configured printer(s) enabled for users.");
            } else {
                updatePrinterManagementSummary("No printers are enabled for users yet.");
            }
        }

        function setPrintControlsDisabled(isDisabled) {
            var buttonIds = ['print_button', 'custom_print_button', 'import_print_button'];
            buttonIds.forEach(function(buttonId) {
                var button = document.getElementById(buttonId);
                if(button) {
                    button.disabled = isDisabled;
                }
            });

            ['selected_device', 'import_selected_device'].forEach(function(selectId) {
                var select = document.getElementById(selectId);
                if(select) {
                    select.disabled = isDisabled;
                }
            });
        }

        function setStopButtonDisabled(isDisabled) {
            ['stop_printer_button', 'import_stop_printer_button'].forEach(function(buttonId) {
                var button = document.getElementById(buttonId);
                if(button) {
                    button.disabled = isDisabled;
                }
            });
        }

        function stopSelectedPrinter() {
            var deviceToStop = active_print_device || selected_device;
            if(!deviceToStop) {
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
                "Printer: " + selectedPrinterName(deviceToStop),
                "The app will stop sending more labels.",
                "The printer should stop after the current label or buffered labels finish."
            ]);

            return new Promise((resolve, reject) => {
                deviceToStop.send("~JA", function(){
                    updatePrintJobStatus(activePrintJobId, 'canceled', 'Canceled by user from browser', activeSentCount).finally(function(){
                        activePrintJobId = null;
                        activeSentCount = 0;
                        active_print_device = null;
                        isPrinting = false;
                        setPrintControlsDisabled(false);
                        setStopButtonDisabled(false);
                        setPrintStatus("Stop command sent", [
                            "Printer: " + selectedPrinterName(deviceToStop),
                            "Queued labels were canceled if they were still in the printer buffer."
                        ]);
                        resolve();
                    });
                }, function(errorMessage){
                    var message = errorMessage || "Unable to send stop command";
                    setStopButtonDisabled(false);
                    setPrintStatus("Unable to stop printer", [
                        "Printer: " + selectedPrinterName(deviceToStop),
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
                    printer_name: printerNameForJob(selected_device),
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
            var jobPrinter = active_print_device || selected_device;

            return fetch('/api/print_jobs/' + jobId + '/status/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    status: status,
                    message: message || '',
                    printer_name: printerNameForJob(jobPrinter),
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

        function clampNumber(value, min, max) {
            return Math.min(max, Math.max(min, value));
        }

        function estimateCode128Width(value, moduleWidth) {
            return Math.ceil(((value.length * 11) + 35) * moduleWidth);
        }

        function importBarcodeModuleWidth(labelValue, maxWidth) {
            for(var moduleWidth = 8; moduleWidth >= 1; moduleWidth--) {
                if(estimateCode128Width(labelValue, moduleWidth) <= maxWidth) {
                    return moduleWidth;
                }
            }
            return 1;
        }

        function importTextSizing(labelValue, maxWidth) {
            var length = Math.max(labelValue.length, 1);
            var height = 46;
            if(length > 14) {
                height = 40;
            }
            if(length > 22) {
                height = 34;
            }
            if(length > 34) {
                height = 28;
            }
            if(length > 48) {
                height = 24;
            }

            var width = clampNumber(Math.floor(maxWidth / (length * 0.58)), 14, height);
            return {
                height: height,
                width: width
            };
        }

        function centeredImportLabelTemplate(labelValue, encodedLabelValue) {
            var labelWidth = 406;
            var labelLength = 203;
            var horizontalMargin = 6;
            var usableWidth = labelWidth - (horizontalMargin * 2);
            var barcodeUsableWidth = labelWidth - 4;
            var barcodeModuleWidth = importBarcodeModuleWidth(labelValue, barcodeUsableWidth);
            var barcodeHeight = labelValue.length > 30 ? 112 : 132;
            var barcodeWidth = estimateCode128Width(labelValue, barcodeModuleWidth);
            var barcodeX = Math.round((labelWidth - Math.min(barcodeWidth, barcodeUsableWidth)) / 2);
            var barcodeY = 12;
            var textBoxWidth = usableWidth;
            var textSizing = importTextSizing(labelValue, textBoxWidth);
            var textY = clampNumber(barcodeY + barcodeHeight + 8, 148, labelLength - textSizing.height - 2);

            return '^XA^PW' + labelWidth
                + '^LL' + labelLength
                + '^LH0,0'
                + '^FO' + barcodeX + ',' + barcodeY
                + '^BY' + barcodeModuleWidth
                + '^BCN,' + barcodeHeight + ',N,N,N'
                + '^FH^FD' + encodedLabelValue + '^FS'
                + '^A0N,' + textSizing.height + ',' + textSizing.width
                + '^FO' + horizontalMargin + ',' + textY
                + '^FB' + textBoxWidth + ',1,0,C,0'
                + '^FH^FD' + encodedLabelValue + '^FS'
                + '^XZ';
        }

        function  LPNTemplate(FullLPN, options){
            options = options || {};
            var labelValue = normalizeLabelValue(FullLPN);
            var encodedLabelValue = zplHexField(labelValue);

            if(options.layout === 'importCentered') {
                return centeredImportLabelTemplate(labelValue, encodedLabelValue);
            }

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
                var dataToWrite = LPNTemplate(fullLPN, { layout: 'importCentered' });
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
        function getStatus(zebraPrinter, device) {
            return new Promise((resolve, reject) => {
                zebraPrinter.getStatus(function(status){
                    var statusMessage = status.getMessage();
                    console.log(statusMessage);

                    //check the status of the printer and alert the user if the printer is not ready
                    switch(statusMessage) {
                        case "Head Open":
                            setPrintStatus("Printer needs attention", [
                                "Printer: " + selectedPrinterName(device),
                                "Close the printer head, then try again."
                            ]);
                            alert("Please Close Printer Head");
                            resolve(false);
                            break;
                        case "Paper Out":
                            setPrintStatus("Printer needs media", [
                                "Printer: " + selectedPrinterName(device),
                                "Load labels or check the media path, then try again."
                            ]);
                            alert("Please Check Paper");
                            resolve(false);
                            break;
                        case "Paused":
                            setPrintStatus("Printer is paused", [
                                "Printer: " + selectedPrinterName(device),
                                "Resume the printer, then try again."
                            ]);
                            alert("Printer Paused. Please Resume");
                            resolve(false);
                            break;
                        default:
                            setPrintStatus("Printer ready", [
                                "Printer: " + selectedPrinterName(device),
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

            let firstIndex = dataToWrite.indexOf("^XA");
            let lastIndex = dataToWrite.lastIndexOf("^XA");

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
                    lastIndex = dataToWrite.lastIndexOf("^XA");

                    let insertAfterLast = lastIndex + 3; 
                    dataToWrite = dataToWrite.substring(0, insertAfterLast) + "^MMC" + dataToWrite.substring(insertAfterLast);
                }
            }

            return dataToWrite;
        }

        function sendRawToPrinter(device, dataToWrite) {
            return new Promise((resolve, reject) => {
                device.send(dataToWrite, function(){
                    resolve();
                }, function(errorMessage){
                    reject(new Error(errorMessage || 'Printer send failed'));
                });
            });
        }

        function sendRawToSelectedPrinter(dataToWrite) {
            return sendRawToPrinter(selected_device, dataToWrite);
        }

        async function writeLabelsToSelectedPrinter(lpns, printJobId, options) {
            activePrintJobId = printJobId || null;
            activeSentCount = 0;
            options = options || {};
            var printDevice = options.device || selected_device;
            active_print_device = printDevice;

            var totalLabels = lpns.length;
            var sentLabels = 0;
            var jobLine = printJobId ? "Job: " + printJobId : (options.sourceName || "Imported labels");

            try {
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
                        "Printer: " + selectedPrinterName(printDevice),
                        jobLine,
                        "Sending " + (start + 1) + "-" + end + " of " + totalLabels,
                        "Stop Printer will cancel labels that have not been sent yet."
                    ]);

                    try {
                        await sendRawToPrinter(printDevice, dataToWrite);
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
                    "Printer: " + selectedPrinterName(printDevice),
                    "Labels: " + sentLabels,
                    jobLine
                ]);
            } finally {
                if(active_print_device === printDevice) {
                    active_print_device = null;
                }
            }
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

            var importPrinter = selected_import_device || selected_device;
            if(!importPrinter) {
                setNoPrinterStatus("Choose a Zebra printer from the file print list.");
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

                var zebraPrinter = new Zebra.Printer(importPrinter);
                setPrintStatus("Checking printer...", "Printer: " + selectedPrinterName(importPrinter));
                var printerReady = await getStatus(zebraPrinter, importPrinter);
                if(!printerReady) {
                    return;
                }

                setPrintStatus("Printing imported labels...", [
                    "File: " + file.name,
                    "Labels: " + importData.totalLabels,
                    "Printer: " + selectedPrinterName(importPrinter)
                ]);
                await writeLabelsToSelectedPrinter(importData.labels, null, {
                    device: importPrinter,
                    boldLastSix: shouldBoldLastSix(),
                    layout: 'importCentered',
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

            let firstIndex = dataToWrite.indexOf("^XA");
            let lastIndex = dataToWrite.lastIndexOf("^XA");

            if (firstIndex !== -1 && firstIndex === lastIndex) {
                let insertAfter = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfter) + "^MMC" + dataToWrite.substring(insertAfter);
            } else if (firstIndex !== -1) {
                let insertAfterFirst = firstIndex + 3;
                dataToWrite = dataToWrite.substring(0, insertAfterFirst) + "^MMT" + dataToWrite.substring(insertAfterFirst);

                lastIndex = dataToWrite.lastIndexOf("^XA");

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
                if(selected.value == deviceOptionValue(devices[i]))
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

        function onImportDeviceSelected(selected)
        {
            for(var i = 0; i < devices.length; ++i){
                if(selected.value == deviceOptionValue(devices[i]))
                {
                    selected_import_device = devices[i];
                    setPrintStatus("File print printer selected", "Printer: " + selectedImportPrinterName());
                    return;
                }
            }
        }
        window.onload = setup;

        
