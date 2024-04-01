// This file is used to interact with the Zebra Browser Print SDK
// It is used to print custom LPNs and generate LPNs from the server

//Select the printer
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
                        
                        //get the list of devices
                        BrowserPrint.getLocalDevices(function(device_list){
                            for(var i = 0; i < device_list.length; i++)
                            {
                                var device = device_list[i];

                                //add the device to the list of devices if it is not the selected device
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

        /*
        * Get the application configuration from the client machine
        */
        function getConfig(){
            BrowserPrint.getApplicationConfiguration(function(config){
                alert(JSON.stringify(config))
            }, function(error){
                alert(JSON.stringify(new BrowserPrint.ApplicationConfiguration()));
            })
        }

        /*
        * Generate a random string of 11 characters to be used as the LPN
        @returns {string} - The generated LPN
        */
        function generateRandomString() {
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const charactersLength = characters.length;

            //generate a random string of 11 characters
            for (let i = 0; i < 11; i++) {
              const randomIndex = Math.floor(Math.random() * charactersLength);
              result += characters.charAt(randomIndex);
            }
            return result;
          }

          /*
            * Send the generated LPN to the server
          @param {string} fullLPN - The full LPN to be sent to the server
          @returns {Promise} - The promise that resolves to the response from the server
          */
          function sendLPNToServer(fullLPN) {
            const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value;
            
            //send the LPN to the server
            return fetch('/api/add_lpn/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrftoken,
                },
                body: JSON.stringify({ full_lpn: fullLPN })
            })

            //return the response from the server
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

        /*
        * Template for the LPN to be printed on the label and uses the ZPL language
        @param {string} FullLPN - The full LPN to be printed
        */
        function  LPNTemplate(FullLPN){

            //split the LPN into the first 7 characters and the last 4 characters
            var FirstSeven = FullLPN.substr(3, 7);
            var LastFour = FullLPN.substr(10, 4);

            //ZPL template for the LPN
            var template = '^XA^CF0,40^FO40,30^BY2^BCN,100,N,N,N^FD$FullLPN$^FS^CF0,30^FO50,140^FDLPN $FirstSeven$^FS^CF0,60^FO250,140^FD$LastFour$^FS^XZ';

            //replace the placeholders in the template with the LPN
            dataToWrite = template.replace('$FullLPN$', FullLPN).replace('$FirstSeven$', FirstSeven).replace('$LastFour$', LastFour);
            return dataToWrite;
        }

        /*
        * Prints a custom LPN entered by the user and checks the status of the printer
        @returns {Promise} - The promise that resolves to true if the printer is ready to print
        */
        async function printCustomLPN(){

            //check if the printer is ready, if not it will skip the rest of the function
            var zebraPrinter = new Zebra.Printer(selected_device);
            var tf = await getStatus(zebraPrinter);
            console.log("tf: " + tf);
            if(!tf)  {
                return;
            }
            
            console.log("Selected Device: "+ selected_device.name);
            console.log("Custom LPN: "  + document.getElementById("customLPN").value);
            fullLPN = document.getElementById("customLPN").value.toUpperCase();

            //check if the LPN is the correct length if not alert the user
            if(fullLPN.length != 14){
                alert("Invalid LPN");
                return;
            } else {

                //gets the ZPL code for the LPN and sends it to the printer
                dataToWrite = LPNTemplate(fullLPN);
                writeToSelectedPrinter(dataToWrite);
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
                    document.getElementById("print_status").innerText = statusMessage;

                    //check the status of the printer and alert the user if the printer is not ready
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
                    reject(error); 
                });
            });
        }

        /*
        * Generates the LPNs from the server and gets them ready to send to the printer
        @returns {Promise} - The promise that resolves to the LPNs generated
        */
        async function getLPNs(){
            
            //check if the printer is ready, if not it will skip the rest of the function
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
            
            //generate the LPNs and send them to the server to be checked if they already exist
            for(let x = 0; x < numberOfLPNs; x++) {
                let tempLPN = 'LPN' + generateRandomString();
                let response = await sendLPNToServer(tempLPN);
                
                //if the LPN is not already in the database, add it to the list of LPNs to be printed
                if (response.status === 'success') {
                    LPNs.push(tempLPN);
                    document.getElementById("print_status").innerText = 'LPNs Generated';
                    console.log("Server Response: " + response.status + " " + response.lpn);
                    console.log("LPN added: ", tempLPN);
                } else {
                    console.log("LPN already exists or error: ", tempLPN);
                }
            }
            
            //write the LPNs into a continual line of ZPL code for printer to print fluidly
            LPNs.forEach(FullLPN => {
                dataToWrite = dataToWrite + LPNTemplate(FullLPN)
            });
            
            //write to printer
            writeToSelectedPrinter(dataToWrite);

        }

        /*
        * Writes the data to the selected printer
        @param {string} dataToWrite - The data to be written to the printer
        */
        function writeToSelectedPrinter(dataToWrite) {
            selected_device.send(dataToWrite, undefined, function(errorMessage){});
        }

        /*
        * Reads the data from the selected printer
        */
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

        /*
        * Reads the data from the selected printer
        */
        function readFromSelectedPrinter()
        {
        
            selected_device.read(readCallback, errorCallback);
            
        }

        /*
        * Gets the device list in an alert format
        */
        function getDeviceCallback(deviceList)
        {
            alert("Devices: \n" + JSON.stringify(deviceList, null, 4))
        }
        
        /*
        * Gets the device list
        @returns {Promise} - The promise that resolves to the device list
        */
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