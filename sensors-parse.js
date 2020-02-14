const METADATA_UPDATE_INTERVAL = 15 * 60; // in seconds

module.exports = function (RED) {
    function SensorsParseNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        var configuration = [];
        var context = this.context().flow;

        if (config.configuration) {
            try {
                configuration = JSON.parse(config.configuration);
                if (!Array.isArray(configuration)) {
                    node.error("The provided configuration is not an Array.");
                }
            } catch (e) {
                node.error("The provided configuration is not a valid JSON.", e);
            }
        }

        node.on('input', function (msg, send, done) {

            this.status({fill: "red", shape: "ring", text: "start processing"});

            // For maximum backwards compatibility, check that send exists.
            // If this node is installed in Node-RED 0.x, it will need to fallback to using `node.send`
            var send = send || function () {
                node.send.apply(node, arguments)
            };

            var timestamp = Math.floor(Date.now() / 1000);
            var timestampForJson = new Date();

            var sensors_metadata = configuration.filter(function (conf) {
                return timestamp - (context.get('sensor-metadata-last-update-' + conf.deviceUUID) || 0) > METADATA_UPDATE_INTERVAL
            }).map(function (conf) {
                return {
                    payload: {
                        deviceUUID: conf.deviceUUID,
                        name: conf.name,
                        type: conf.type,
                        unit: conf.unit,
                        state: conf.state,
                        location: conf.location ? conf.location :
                            (sensor_configuration.find(function (s) {
                                    return s.deviceUUID === conf.deviceUUID;
                                }) ?
                                    sensor_configuration.find(function (s) {
                                        return s.deviceUUID === conf.deviceUUID;
                                    }).location
                                    : null
                            ),
                        parent_deviceUUID: conf.parent_deviceUUID,
                        observation_interval: conf.observation_interval,
                        timestamp: timestampForJson
                    },
                    topic: conf.metadata_topic
                }
            });

            /**
             * Example Sensor Message: {"id":"633F18FDC337DED7","co":0.5,"co2":647.7,"t":22.1,"h":36.3,"p":99866.2,"l":84}
             **/
            var observations = configuration.filter(function (x) {
                return x.sensorID === msg.payload.id &&
                    x.hasOwnProperty('property_field') &&
                    msg.payload.hasOwnProperty(x.property_field);
            }).map(function (sensor) {
                var field = sensor.property_field;
                var value = msg.payload[field];

                return {
                    payload: {
                        deviceUUID: sensor.deviceUUID,
                        type: sensor.type,
                        unit: sensor.unit,
                        value: value,
                        timestamp: timestampForJson
                    },
                    topic: sensor.observation_topic
                };
            });

            data = [observations.concat(sensors_metadata)];

            send(data, function (err) {
                if (err) {
                    if (done) {
                        // Node-RED 1.0 compatible
                        done(err);
                    } else {
                        // Node-RED 0.x compatible
                        node.error(err, data);
                    }
                }
            });

            node.log("Sent " + sensors_metadata.length + " Sensors Metadata and " + observations.length + " Observations");
            // node.warn("Something happened you should know about");
            // node.error("Oh no, something bad happened");

            this.status({fill: "green", shape: "square", text: "completed"});

            //Everything went fine, let's update context timestamps
            sensors_metadata.forEach(function (conf) {
                context.set('sensor-metadata-last-update-' + conf.deviceUUID, timestamp);
            });

            if (done) {
                done();
            }
        });

        // node.on('close', function (done) {
        //
        //     done();
        //     // TODO un-register the registered sensor
        //     /*doSomethingWithACallback(function() {
        //         done();
        //     });*/
        // });
    }

    RED.nodes.registerType("sensors-parse", SensorsParseNode);
};
