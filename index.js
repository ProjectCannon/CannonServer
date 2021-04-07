#!

console.log(" _________________________");
console.log("/                         \\");
console.log("|  The next advancements  |");
console.log("| in security were always |");
console.log("|  right in  front of us  |");
console.log("|                         |");
console.log("|  privacy.alexisok.dev   |");
console.log("|                         |");
console.log("\\_________________________/");

const version = require("./package.json").version;
const mainws  = require("./mainws");

console.log(`Starting Cannon Server version ${version}.`);

console.log("Getting the configuration...");

const config = require("./config.json");

//check ports
if(config.port <= 1024)
    console.warn("WARNING: you are using a privileged port!  Are you sure you want to do this?");
console.log(`Using port ${config.port}`);

mainws.start(config.port).then(() => {
    console.log("Started the websocket server!  Clients may now connect.");
});
