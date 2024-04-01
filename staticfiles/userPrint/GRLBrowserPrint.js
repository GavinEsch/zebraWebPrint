var selected_device;
        var devices = [];
        function setup()
        {
            BrowserPrint.getDefaultDevice("printer", function(device)
                    {

                        selected_device = device;
                        devices.push(device);
                        var html_select = document.getElementById("selected_device");
                        var option = document.createElement("option");
                        option.text = device.name;
                        html_select.add(option);
                        
                        BrowserPrint.getLocalDevices(function(device_list){
                            for(var i = 0; i < device_list.length; i++)
                            {
                                var device = device_list[i];
                                if(!selected_device || device.uid != selected_device.uid)
                                {
                                    devices.push(device);
                                    var option = document.createElement("option");
                                    option.text = device.name;
                                    option.value = device.uid;
                                    html_select.add(option);
                                }
                            }
                            
                        }, function(){alert("Error getting local devices")},"printer");
                        
                    }, function(error){
                        alert(error);
                    })
        }
        function getConfig(){
            BrowserPrint.getApplicationConfiguration(function(config){
                alert(JSON.stringify(config))
            }, function(error){
                alert(JSON.stringify(new BrowserPrint.ApplicationConfiguration()));
            })
        }

        function generateRandomString() {
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const charactersLength = characters.length;
            for (let i = 0; i < 11; i++) {
              const randomIndex = Math.floor(Math.random() * charactersLength);
              result += characters.charAt(randomIndex);
            }
            return result;
          }

          function sendLPNToServer(fullLPN) {
            const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            
            return fetch('/api/add_lpn/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({ full_lpn: fullLPN })
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .catch(error => {
                console.error('Error:', error);
                return { status: 'error', message: 'Network error or server not responding' };
            });
        }

        function  LPNTemplate(FullLPN){
            var FirstSeven = FullLPN.substr(3, 7);
            var LastFour = FullLPN.substr(10, 4);
            var template = '^XA^CF0,40^FO40,30^BY2^BCN,100,N,N,N^FD$FullLPN$^FS^CF0,30^FO50,140^FDLPN $FirstSeven$^FS^CF0,60^FO250,140^FD$LastFour$^FS^XZ';
            dataToWrite = template.replace('$FullLPN$', FullLPN).replace('$FirstSeven$', FirstSeven).replace('$LastFour$', LastFour);
            return dataToWrite;
        }

        async function printCustomLPN(){
            var zebraPrinter = new Zebra.Printer(selected_device);
            var tf = await getStatus(zebraPrinter);
            console.log("tf: " + tf);
            if(!tf)  {
                return;
            }
            console.log("Selected Device: "+ selected_device.name);
            console.log("Custom LPN: "  + document.getElementById("customLPN").value);
            fullLPN = document.getElementById("customLPN").value.toUpperCase();
            if(fullLPN.length != 14){
                alert("Invalid LPN");
                return;
            } else {
                dataToWrite = LPNTemplate(fullLPN);
                writeToSelectedPrinter(dataToWrite);
            }
        }

        function getStatus(zebraPrinter) {
            return new Promise((resolve, reject) => {
                zebraPrinter.getStatus(function(status){
                    var statusMessage = status.getMessage();
                    console.log(statusMessage);
                    document.getElementById("print_status").innerText = statusMessage;
                    switch(statusMessage) {
                        case "Head Open":
                            alert("Please Close Printer Head");
                            resolve(false);
                            break;
                        case "Paper Out":
                            alert("Please Check Paper");
                            resolve(false);
                            break;
                        case "Paused":
                            alert("Printer Paused. Please Resume");
                            resolve(false);
                            break;
                        default:
                            resolve(true);
                            break;
                    }
                }, function(error){
                    reject(error); // Reject the promise on error
                });
            });
        }

        async function getLPNs(){
            
            var zebraPrinter = new Zebra.Printer(selected_device);
            var tf = await getStatus(zebraPrinter);
            console.log("tf: " + tf);
            if(!tf)  {
                return;
            }

            console.log("Selected Device: "+ selected_device.name);
            var LPNcount = document.getElementById("LPNquantity");
            var numberOfLPNs = parseInt(LPNcount.value);
            console.log("Number of LPNs: " + numberOfLPNs);
            let LPNs = [];
            let dataToWrite = '';

            document.getElementById("print_status").innerText = 'Getting LPNs...';
        
            for(let x = 0; x < numberOfLPNs; x++) {
                let tempLPN = 'LPN' + generateRandomString();
                let response = await sendLPNToServer(tempLPN);
                
        
                if (response.status === 'success') {
                    LPNs.push(tempLPN);
                    document.getElementById("print_status").innerText = 'LPNs Generated';
                    console.log("Server Response: " + response.status + " " + response.lpn);
                    console.log("LPN added: ", tempLPN);
                } else {
                    console.log("LPN already exists or error: ", tempLPN);
                }
            }
        
            LPNs.forEach(FullLPN => {
                dataToWrite = dataToWrite + LPNTemplate(FullLPN)
            });
        
            writeToSelectedPrinter(dataToWrite);

        }

        function writeToSelectedPrinter(dataToWrite) {
            selected_device.send(dataToWrite, undefined, function(errorMessage){});
        }

        var readCallback = function(readData) {
            if(readData === undefined || readData === null || readData === "")
            {
                alert("No Response from Device");
            }
            else
            {
                alert(readData);
            }
            
        }

        var errorCallback = function(errorMessage){
            alert("Error: " + errorMessage);	
        }

        function readFromSelectedPrinter()
        {
        
            selected_device.read(readCallback, errorCallback);
            
        }

        function getDeviceCallback(deviceList)
        {
            alert("Devices: \n" + JSON.stringify(deviceList, null, 4))
        }
        
        function onDeviceSelected(selected)
        {
            for(var i = 0; i < devices.length; ++i){
                if(selected.value == devices[i].uid)
                {
                    selected_device = devices[i];
                    return;
                }
            }
            var zebraPrinter = new Zebra.Printer(selected_device);
            zebraPrinter.getStatus(function(status){
                var statusMessage = status.getMessage();
                console.log(statusMessage);
                document.getElementById("print_status").innerText = statusMessage;
            }, function(error){});
        }
        window.onload = setup;