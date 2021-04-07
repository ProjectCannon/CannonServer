//main websocket handler

const ws = require("ws");

let server;

let auth = require("./auth.json");

//user, socket
let sockets = {}

//user, 1
//ex {"alex": 1}
let timeouts = {};

//user, iso date
let lastLogin = {}

//user, string[]
//ex {"alex": ["<mail from panda>: testing"]}
let mail = {};

/**
 * Set a timeout for a user before their next message.
 * @param user the username to set.
 * @param duration the duration in milliseconds.
 */
async function setUserTimeout(user, duration) {
    timeouts[user] = 1;
    setTimeout(() => {
        timeouts[user] = 0;
    }, duration);
}

/**
 * Check if the user has a timeout or not.
 * @param user the username to check.
 * @return {Promise<boolean>} true if they are being rate-limited, false otherwise.
 */
async function isTimeout(user) {
    if(!timeouts[user])
        return false;
    return timeouts[user] === 1;
}

/**
 * SHA512ify a string
 * 
 * PLEASE LET ME KNOW if i'm doing this wrong
 * 
 * @param raw raw password
 * @return {Promise<string>} the hash
 */
async function pass(raw) {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha512");
    return hash.update(raw, "utf-8").digest("hex");
}

/**
 * Start the server.
 * @param port the port to use.
 */
async function start(port) {
    console.log("Starting WS...");
    
    //https needed for ssl
    const https = require("https");
    const fs = require("fs");
    
    const h = https.createServer({
        cert: fs.readFileSync("./cert.pem"),
        key: fs.readFileSync("./key.pem")
    });
    
    // noinspection JSCheckFunctionSignatures
    server = new ws.Server({server: h});
    h.listen(port);
    
    server.on("connection", onConnection);
}

/**
 * On new client connections.
 * @param ws the websocket.
 * @param req the request
 */
async function onConnection(ws, req) {
    
    //https://community.cloudflare.com/t/ip-address-of-the-remote-origin-of-the-request/13080/26547
    console.log("Connection from " + req.headers["CF-Connecting-IP"]);
    console.log("Client connection opened.");
    
    
    ws.send("welcome to Project Cannon server test!");
    ws.send(" ");ws.send(" ");ws.send(" ");
    ws.send("Type /users for a list of online users and /login to login.  You can see others talk when you login.");
    ws.send(" ");
    ws.send("Please contact AlexIsOK#0384 on Discord if you have any other questions, and /help for a list of commands.");
    ws.send(" ");
    ws.send("For guests: use /login guest guest");
    
    ws.on("message", message => {
        onMessage(message, ws);
    });
    ws.on("close", ws => {
        if(ws.user)
            broadcast(`###SERVER### ${ws.user} has left the chat.`);
    });
}

/**
 * Send the Message of the Day for when users login.
 * @param user the username
 * @param ws the socket
 */
async function sendMOTD(user, ws) {
    ws.send(`Welcome to Project Cannon ${user}!`);
    ws.send(" ");
    let users = await getUsers();
    ws.send(`There are ${users.length} user(s) online: ${users.join(", ")}`);
    ws.send(" ");
    ws.send(`Other info:`);
    ws.send(`  IP address: ${ws._socket.remoteAddress}`);
    if(lastLogin[user])
        ws.send(`  Last login: ${lastLogin[user]}`);
    ws.send(" ")
    if(!mail[user] || mail[user].length === 0)
        ws.send(`You have no new mail.`);
    else
        ws.send(`You have ${mail[user].length} mail, use the "/mail list" command to see your mail.`);
}

/**
 * Get a list of logged in users.
 * @return {Promise<[]>} the list of users.
 */
async function getUsers() {
    let users = [];
    await server.clients.forEach(client => {
        if (client.user)
            users.push(client.user);
    });
    return users;
}

/**
 * On message
 * @param data the content of the message.
 * @param ws the websocket.
 * @return {Promise<*|*>} garbage.
 */
async function onMessage(data, ws) {
    
    //keep alive request
    if(data === "//KEEP-ALIVE")
        return;
    
    //might up this later
    if(data.length > 127)
        return ws.send("Messages must be under 128 characters in length.");
    
    //deny empty or garbage messages
    if(!data.replace(/\s/g, '').length)
        return;
    
    //commands
    if(data.startsWith("/")) {
        const response = await onCommand(data, ws);
        console.log(`command response: ${response}`);
        return await ws.send(response);
    }
    
    //deny not logged in users
    if(!ws.user)
        return await ws.send("You must be logged in to send messages!\nPlease use /login");
    
    console.log(ws.user + ": " + data);
    
    //rate limit
    if(await isTimeout(ws.user))
        return await ws.send("###SERVER### Please wait before sending another message.");
    
    //set the timeout of the user, may be adjusted in the future
    await setUserTimeout(ws.user, 300);
    
    //broadcast message
    await broadcast(`[${ws.user}] - ${data}`);
}

/**
 * Save user mail.
 */
function saveMail() {
    const fs = require("fs");
    fs.writeFileSync("./mail.json", JSON.stringify(mail));
}

/**
 * On commands
 * @param message the raw message.
 * @param ws the websocket.
 * @return {Promise<string|*>} the response.
 */
async function onCommand(message, ws) {
    let m = message.substring(1);
    let args = m.replace("\n", "").split(" ");
    
    args[0] = args[0].replace(/(\r\n|\n|\r)/gm, "");
    
    switch(args[0]) {
        case "help": {
            return "Current commands: /help, /login, /users, /exit, /dm, /mail";
        }
        case "shutdown": {
            //only for me :)
            if(!ws.user || ws.user !== "alexisok") {
                return ws.send("You must be AlexIsOK to run this command.  Become him and try again.");
            }
            await broadcast("###SERVER### SERVER WILL SHUTDOWN SOON.  PLEASE RECONNECT.");
            await broadcast("###SERVER### SERVER WILL SHUTDOWN SOON.  PLEASE RECONNECT.");
            await broadcast("###SERVER### SERVER WILL SHUTDOWN SOON.  PLEASE RECONNECT.");
            setTimeout(() => {
                process.exit(0);
            }, 5000);
            return "done";
        }
        case "reload-auth": {
            //reload authentication (admin)
            if(!ws.user || ws.user !== "alexisok")
                return "bruv";
            auth = require("./auth.json");
            return "ok i guess";
        }
        case "login": {
            
            //disable existing users from logging in
            if(ws.user)
                return "You are already logged in!";
            
            //args
            if (args.length !== 3)
                return "Usage: /login <username> <password | otp>.  Contact Alex to get an account: https://discord.alexisok.dev/";
            await ws.send("\n");
            await ws.send("Checking the login state...");
            
            //user exists?
            if(!auth[args[1]])
                return "Poop!  Couldn't find your user.  Contact Alex if you 100% spelt it right.";
            
            //nt terminal is stupid, check extra characters here.
            if(auth[args[1]] !== await pass(args[2]) && auth[args[1]] !== await pass(args[2].substring(0, args[2].length - 1)))
                return "That the right password m8?  Don't look like it to me.";
            
            //successful login
            ws.user = args[1];
            sockets[args[1]] = ws;
            
            //let everyone know you're here, for better or for worse.
            await broadcast(`###SERVER### ${args[1]} has joined the chat.`);
            
            //motd
            await sendMOTD(args[1], ws);
            
            setTimeout(() => {
                ws.send("Connected to global chat.");
            }, 200);
            
            lastLogin[args[1]] = new Date().toISOString();
            return `Logged in as ${args[1]}`;
        }
        case "users": {
            //list online users.
            let users = await getUsers();
            users.unshift(`Logged in users (${users.length}): `)
            return users.join(" ");
        }
        case "exit": {
            setTimeout(() => {
                ws.terminate();
            }, 1000);
            if(ws.user)
                await broadcast(`###SERVER### ${ws.user} has left the chat.`);
            return "You have been disconnected, please exit your websocket program.";
        }
        case "dm": {
            if(!ws.user)
                return "This command requires authentication.  Please use /login first.";
            
            if(args.length < 3)
                return "Usage: /dm <user> <message...>";
            
            let users = await getUsers();
            
            //check user exists
            if(!users.includes(args[1])) {
                //if user has account
                if(auth[args[1]])
                    return `Hmm... it seems like ${args[1]} is offline right now.`;
                else
                    return `I don't think that you spelt ${args[1]} correctly, as this is not a valid user.`;
            }
            
            //check accounts, this for loop should not fail.
            for (const client of server.clients) {
                if(!client.user || client.user !== args[1])
                    continue;
                args.shift();
                args.shift();
                sockets[client.user].send(`(dm from ${ws.user} to you) ${args.join(" ")}`);
                return `(dm from you to ${client.user}) ${args.join(" ")}`;
            }
            
            //should not display
            return "Message failed to send.  This is an error and you should report it.";
        }
        case "mail": {
            if(!ws.user)
                return "This command requires authentication.";
            if(args.length === 1)
                return "Usage: /mail <send | read | clear>"
            if(!mail[ws.user]) {
                //make new inbox if the user doesn't have one yet.
                mail[ws.user] = [];
                await ws.send("Created an inbox for you.");
            }
            
            //send mail to a user
            if(args[1] === "send") {
                let u = args[2];
                if(args.length <= 3)
                    return "Usage: /mail send <user> <message...>";
                
                //check user exists
                if(!auth[u])
                    return "Cannot find user " + args[2];
                
                if(args[2] === ws.user)
                    return "You cannot sent mail to yourself, though I understand the appeal.";
                
                //make new inbox if it doesn't exist
                if(!mail[u])
                    mail[u] = [];
                
                //inbox full is 50
                if(mail[u].length >= 50)
                    return "This user's inbox is full!";
                
                //messy, but remove first three args
                args.shift();args.shift();args.shift();
                
                //send mail by pushing to array
                mail[u].push(`<mail from ${ws.user}>: ${args.join(" ")}`);
                
                //save
                saveMail();
                return "Sent!";
            } else if(args[1] === "read" || args[1] === "list") {
                
                //length of 0 is empty
                if(mail[ws.user].length === 0)
                    return "Your mailbox is empty :(";
                
                //display all user mail at once
                mail[ws.user].forEach(m => {
                    ws.send(m);
                });
                return "You can clear your inbox using /mail clear";
            } else if(args[1] === "clear") {
                mail[ws.user] = [];
                saveMail();
                return "Your inbox has been cleared.";
            } else {
                return "Usage: /mail <send | read | clear>";
            }
            
        }
        default:
            return `Don't think that ${args[0]} is a command, try /help for a list of commands.`;
    }
}

async function broadcast(raw) {
    server.clients.forEach(client => {
        // noinspection JSUnresolvedVariable
        if(client.readyState === ws.OPEN && client.user)
            client.send(raw);
    });
}

module.exports = {
    start
}
