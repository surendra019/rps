//importing modules

const http = require("http")
const fs = require('fs')
const { match } = require("assert")
const { send } = require("process")
const { clearInterval } = require("timers")
const { clear } = require("console")
const websocketServer = require("websocket").server
const httpServer = http.createServer()

// change this while deploying the server
httpServer.listen(3055, () => console.log("Listening on port 3055"))



const register_data_file = './database/register_data.json' // path to json file which stores player's register data
const match_data_file = './database/match_data.json'

const maxWaitingTime = 30000; // Maximum waiting time in milliseconds (e.g., 30 seconds)

let findOppForArr = [] //array which stores the player object for a temporary time when they are in match making phase of the game.


// referencing the http server to the websocket server

const wsServer = new websocketServer({
    "httpServer": httpServer
})


let connectedPlayersArr = [] //array which stores each player's data as an object i.e name and connection
let matchesArr = [] //array which stors all the matches data which are ongoing

wsServer.on("request", request => {
    const connection = request.accept(null, request.origin)

    const socketId = connection.socket.remoteAddress + ':' + connection.socket.remotePort;

    connection.on("open", () => console.log("Opened Connection")) //this is when someone connected

    // when someone disconnects, remove his identity from the currect status
    connection.on("close", () => {
        // remove player object after disconnection
        remove_from_connected_players(connection); 
        remove_from_finding_arr(connection);
        console.log("Closed Connection")
    })

    connection.on("message", message => {
        var data = JSON.parse(message.binaryData.toString())
        
        // switch case statements for handling connection functions (strings received from the front-end)
        if (Object.keys(data).length>2){
            switch(data.method){
                case "calculate_result": calculate_result(connection, data.msg1, data.msg2);
                                        break;
                case "played_chance": played_chance(connection, data.msg1, data.msg2, data.msg3, data.msg4);
                                        break;
                default: 2+3;
                        break;
            }

        }else{
            let name;
            switch (data.method){
                case "register_name": register_name(data.msg, connection);
                                    name = data.msg;
                                    break;
                case "find_opponent": 
                                    findOpponent(connection, name);
                                    break;
                case "clear_previous_data": clear_previous_data(connection);
                                    break;
                case "game_started": game_started(connection);
                                    break;
                case "chance_timeout": chance_timeout(connection, data.msg);
                                    break;
                default: 2+3;
                        break;
        }

        }
        
    })
    send_response(connection, "connected", "Welcome to the Server")
    
})

function chance_timeout(player, round){
    matchesArr.forEach((match=>{
        if(match.player1.connection==player){
            match.player1[`round${round}`] = String(0);
            // send_response(match.player2.connection, "opponent_chance_timeout")
            send_response(match.player2.connection, "round_winner", match.player2.name)
            send_response(match.player1.connection, "round_winner", match.player2.name)
        }else if(match.player2.connection==player){
            match.player2[`round${round}`] = String(0);
            // send_response(match.player1.connection, "opponent_chance_timeout")
            send_response(match.player2.connection, "round_winner", match.player1.name)
            send_response(match.player1.connection, "round_winner", match.player1.name)
        }
    }))
}

function game_started(connection){
    
    // checks player's connectivity every 10ms after getting matched
    let checkInterval;
    checkInterval = setInterval(()=>{
        matchesArr.forEach((match)=>{
            if (match.player1.connection==connection){
                if(connection.connected==false){
                    send_response(match.player2.connection, "opp_disconnected", "opponent disconnected")
                    clearInterval(checkInterval)
                }
            }else if(match.player2.connection==connection){
                if(connection.connected==false){
                    send_response(match.player1.connection, "opp_disconnected", "opponent disconnected")
                    clearInterval(checkInterval)
                }
            }
        })
}, 10)
}

function calculate_final_winner(match_obj){
    
}
function add_match_data(match_obj){
    const playerId = match_obj.player1.connection.socket.remoteAddress + ':' + match_obj.player1.connection.socket.remotePort;
    const oppId = match_obj.player2.connection.socket.remoteAddress+ ':' + match_obj.player2.connection.socket.remotePort;

    // console.log(Object.keys(match_obj).length)
    let final_winner;

    console.log(match_obj.player1.wins)
    console.log(match_obj.player2.wins)
    if(match_obj.player1.wins>match_obj.player2.wins){
        final_winner = match_obj.player1.name
    }else if(match_obj.player1.wins<match_obj.player2.wins){
        final_winner = match_obj.player2.name
    }else{
        final_winner = "tie"
    }
    const basic_match_obj = {
        player1: {
            name: match_obj.player1.name,
            id: playerId,
        },
        player2:{
            name: match_obj.player2.name,
            id: oppId
        },
        round1: {
            player1_chance: match_obj.player1.round1,
            player2_chance: match_obj.player2.round2,
            winner: match_obj.winner1
        },
        round2: {
            player1_chance: match_obj.player1.round2,
            player2_chance: match_obj.player2.round2,
            winner: match_obj.winner2
        },
        final_winner : final_winner
    }
    // console.log(match_obj.winner)

    if(!fs.existsSync(match_data_file)){
        let final_match_obj = {
            match1 : basic_match_obj
        }
        fs.writeFileSync(match_data_file, JSON.stringify(final_match_obj), 'utf-8', (err)=>{
            if(err){
                console.log("an error encountered while writing the match_data json file")
            }
       })
    }else{
        let obj = getObjFromJson(match_data_file);
        // console.log(obj)
        let key = `match${Object.keys(obj).length+1}`;
        
        obj[key] = basic_match_obj
        fs.writeFileSync(match_data_file, JSON.stringify(obj), 'utf-8', (err)=>{
            if(err){
                console.log("an error encountered while writing the match_data json file")
            }
       })
    }
}

function clear_previous_data(connection){
    // clear previous match data from arrays if new game is started
    remove_from_finding_arr(connection);
    remove_from_match_obj_arr(connection);
}

function remove_from_connected_players(connection){
    // remove the player object from connectedPlayersArr
    connectedPlayersArr.forEach((el)=>{
        if (el.connection==connection){
            let indexToRemove = connectedPlayersArr.indexOf(el);
            if (indexToRemove !== -1) {
                connectedPlayersArr.splice(indexToRemove, 1);
            }
        }
    })
}
function remove_from_finding_arr(connection){
    // remove from the matching phase temporary array of players
    // throgh iteration
    findOppForArr.forEach((el)=>{
        if (el.connection==connection){
            let indexToRemove = findOppForArr.indexOf(el);
            if (indexToRemove !== -1) {
                findOppForArr.splice(indexToRemove, 1);
            }
        }
    })  
}

function remove_from_match_obj_arr(connection){
    // remove match object from matchesArr
    matchesArr.forEach((match)=>{
        if(match.player1.connection==connection){
            matchesArr.splice(matchesArr.indexOf(match), 1)
        }else if(match.player2.connection==connection){
            matchesArr.splice(matchesArr.indexOf(match), 1)
        }
    })
}

function send_response(connection, method, msg){
    // function for sending responses to the frontend
    
    const payload = {
        "method": method,
        "msg": msg
    }
    connection.send(JSON.stringify(payload))
}

function register_name(name, connection){
    // registers name, id and time of player and save it in a json file if the file exists or create a new file then save
    let time = new Date();
    if(!fs.existsSync(register_data_file)){
        
        var player_obj = {
            player1:{
                name : name,
                time : time
            }
            
        }
        fs.writeFileSync(register_data_file, JSON.stringify(player_obj), 'utf-8', (err)=>{
            if (err){
                console.log('error occured while creating the json file.')
                return;
            }
        })
        

    }else{
        let obj = getObjFromJson(register_data_file);
        // console.log(obj)
        let key = `player${Object.keys(obj).length+1}`;
        
        let player_obj = {
            name: name,
            time: time
        }
        obj[key] = player_obj;

        fs.writeFileSync(register_data_file, JSON.stringify(obj), 'utf-8', (err)=>{
            if (err){
                console.log('error occured while creating the json file.')
                return;
            }
        })
        

    }

    // remove the previous player object (if exists) when a new game is started
    connectedPlayersArr.forEach((player_object)=>{
        if(player_object.connection==connection){
            connectedPlayersArr.splice(connectedPlayersArr.indexOf(player_object), 1);
        }
    })
    
    // push the new player object to the connectedPlayersArr array
    let player = {
        connection: connection,
        name : name
    }
    connectedPlayersArr.push(player)

    send_response(connection, "name_registered_sucessfully", `name has been registered sucessfully at ${time}`);
    return name;
}

function getObjFromJson(file){
    // return a javascript object from a json file,if exists else return false
    let data;
    if(fs.existsSync(file)){
        const data_str = fs.readFileSync(file, 'utf-8')
        data = JSON.parse(data_str)
        return data;
    }else{
        return false;
    }
}

    
function findOpponent(player, name) {

    // this function is called from the front end when the player is in the match making phase and it's object will be stores in the findOppForArr array
    let player_object;
    connectedPlayersArr.forEach((el)=>{
        if(el.connection==player){
            findOppForArr.push(el);
            player_object = el
        }
    })

    // checks if there are opponents in the same phase of the game such that match making will be inititated.
    //  it returns promise with an array of available opponents
    checkOpponentsArraySize(player).then((resultArray) => {
        
        // resultArray will be equals to "matched" when one player find the other one and the other one is still finding his opponent in this phase,
        // at this moment, the promise will be resolved and returns "matched" so that any third player don't find him, as he is matched.
        if(resultArray!="matched"){
            if (resultArray.length >= 1) {
                
                // getting random player when the resultArray's length is more than  one
                const randomIndex = Math.floor(Math.random() * resultArray.length);
                const randomValue = resultArray[randomIndex];
    
                send_response(player, "got_opponent", randomValue.name)
                send_response(randomValue.connection, "got_opponent", player_object.name)
                

                createMatch(player_object, randomValue);

                remove_from_finding_arr(player_object.connection);
                remove_from_finding_arr(randomValue.connection)
               
            } else {
              console.log('No opponents found within the specified time.');

              remove_from_finding_arr(player);
              send_response(player, "no_opponent_found", "no opponent found")
            }
        }
        })
    }

function createMatch(player_object, randomValue){
        var match_object = {
            player1: player_object,
            player2: randomValue,

        }
        matchesArr.push(match_object);
}

function checkOpponentsArraySize(player) {

    let opponents = []
  return new Promise((resolve) => {
    let checkInterval;
    const if_in_match_interval = setInterval(()=>{
        matchesArr.forEach(element => {
            if(element.player1.connection==player){
                resolve("matched");
                clearInterval(checkInterval);
                clearInterval(if_in_match_interval)
            }else if(element.player2.connection==player){
                resolve("matched")
                clearInterval(checkInterval);
                clearInterval(if_in_match_interval)
            }
        });
    }, 10)
    
    const startTime = Date.now(); // Record the start time

    checkInterval = setInterval(() => {

        
        
        findOppForArr.forEach((el)=>{
                if(el.connection!=player){
                    opponents.push(el)
                }
            }
            
    )
    send_response(player, "matching_time", `${Date.now() - startTime}`);
      if (opponents.length >= 1 || Date.now() - startTime >= maxWaitingTime) {
        clearInterval(checkInterval); // Stop the interval
        resolve(opponents);
         // Resolve the promise with the opponents array
      }
    }, 1000); // Check array size every 1 second
  });
}


function played_chance(player, round, chance){
    
    matchesArr.forEach((match)=>{

        let chance_obj = {
            [`${chance}`] : chance
            
        }

        switch(player){
            case match.player1.connection: //console.log('entered first condisan')
                                            match.player1[`round${round}`] = chance
                                            send_response(match.player2.connection, "opponent_played", chance)
                                            // console.log(match.player2)
                                            if(match.player2.hasOwnProperty([`round${round}`])){
                                                
                                                let result = calculate_result(match.player1.name,match.player2.name, match.player1[`round${round}`], match.player2[`round${round}`])
                                                send_response(player, "round_winner", result)
                                                send_response(match.player2.connection, "round_winner", result)
                                                match[`winner${round}`]= result
                                                if (round==2){
                                                    add_match_data(match)
                                                }
                                                match.player1[`wins`] = 0
                                                match.player2[`wins`] = 0
                                                if(result==match.player1.name){
                                                    match.player1[`wins`]+=1
                                                }else if(result==match.player2.name){

                                                    match.player2[`wins`]+=1
                                                }

                                            }
                                            
                                            
                                            break;
            case match.player2.connection: //console.log('entered second condisan')
                                            match.player2[`round${round}`] = chance
                                            send_response(match.player1.connection, "opponent_played", chance)
                                            // console.log(match.player1)
                                            if(match.player1.hasOwnProperty([`round${round}`])){
                                                
                                                let result = calculate_result(match.player2.name,match.player1.name, match.player2[`round${round}`], match.player1[`round${round}`])
                                                send_response(player, "round_winner", result)
                                                send_response(match.player1.connection, "round_winner", result)
                                                match[`winner${round}`]= result
                                                if (round==2){
                                                    add_match_data(match)
                                                }
                                                match.player1[`wins`] = 0
                                                match.player2[`wins`] = 0
                                                if(result==match.player1.name){
                                                    match.player1[`wins`]+=1
                                                }else if(result==match.player2.name){
                                                    match.player2[`wins`]+=1
                                                }
                                            }
                                            break;
        } 
    })
}
function calculate_result(player_name, opp_name, player_chance, opp_chance){
    let result;
    if(player_chance=="rock"&&opp_chance=="paper"){
        result=opp_name
    }else if(player_chance=="rock"&&opp_chance=="scissor"){
        result = player_name
    }else if(player_chance=="paper"&&opp_chance=="rock"){
        result=player_name

    }else if(player_chance=="paper"&&opp_chance=="scissor"){
        result=opp_name
    }else if(player_chance=="scissor"&&opp_chance=="rock"){
        result=opp_name
    }else if(player_chance=="scissor"&&opp_chance=="paper"){
        result=player_name
    }else{
        result = "tie"
    }
    return result;
}