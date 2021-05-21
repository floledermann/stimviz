
import fs from "fs/promises";
import path from "path";
import csv from "@fast-csv/format";

import Dimension from "another-dimension";


let dataDir = "testdata/experiment-1";
let outputFileName = "all_aggregated_thresholds";
let outputFilePath = path.join(dataDir, outputFileName);

const MIN_ID = 2;
const MAX_ID = null;

let output = [];
let outputFunc = writeCSV;
//let outputFunc = writeJSON;

let id = MIN_ID;
let fileName = null;

const stations = {
  "C": {pixeldensity: 236},
  "A": {pixeldensity: 343},
  "D": {pixeldensity: 520},
  "B": {pixeldensity: 807},
};

const tasks = {
  snellen: {offset: 3, attr: "size"},
  line_parallel: {offset: 4, attr: "width"},
  line_dashed: {offset: 5, attr: "width"},
  tao: {offset: 6, attr: "size"},
  tao_vanishing: {offset: 7, attr: "size"},
  text: {offset: 8, attr: "fontSize"},
};

const STATIONS_OFFSET = 4;
const TASKS_PER_STATION = 9;
  
const languages = {
  "English": {code: "en", latin: true},
  "German": {code: "de", latin: true},
  "Other Asian or African": {code: "asian", latin: false},
  "Other European or Latin American": {code: "latin", latin: true},
  "Chinese": {code: "cn", latin: false},
  "Japanese": {code: "jp", latin: false},
  "Greek": {code: "gr", latin: false},
  "Russian or other cyrillic": {code: "ru", latin: false},
};

const vision = {
  "Normal vision": "normal",
  "Corrected to normal\n(wearing glasses or contact lenses suitable for reading)": "corrected",
  "Short-sighted\n(far objects appear blurred)": "short-sighted",
  "Far-sighted\n(near objects appear blurred)": "far-sighted",
  "Other vision impairment": "impaired",
  "Would prefer not to answer": "no-answer"
};

const ignoreFields = [
  "description",
  "_type",
  "_version",
  "experimentName",
  "experimentTimeOrigin",
  "experimentStartTime",
  "errors",
  "warnings",
  "results"
];

let stationOrder = {
  A: [0,0,0,0],
  B: [0,0,0,0],
  C: [0,0,0,0],
  D: [0,0,0,0]  
};
  


let transformations = [
  transformTasks
];


while( !MAX_ID || (id < MAX_ID)) {
  
  fileName = "user_" + id.toLocaleString('en',{minimumIntegerDigits:3}) + ".json";
  let filePath = path.join(dataDir, fileName);
  
  let data = null;
  try {
    data = JSON.parse(await fs.readFile(filePath, "utf8"));
  }
  catch (e) {
    console.log(e.message);
    id++;
    if (MAX_ID) {
      console.log("Error reading file " + filePath + " ... continuing.");
      continue;
    }
    console.log("Error reading file " + filePath + " ... stopping.");
    break;
  }
  
  for (let transform of transformations) {
    data = transform(data);
  }
  if (Array.isArray(data)) {
    output = output.concat(data);
  }
  else {
    output.push(data);
  }

  id++;
  
};

console.log();
console.log(output.length + " records read");

console.log(stationOrder);

outputFunc(output);

function transformUser(d) {
    
  d.ageGroup = d.results[0].trials[0].response.label;
  d.gender = d.results[1].trials[0].response.label;
  d.language = languages[d.results[2].trials[0].response.label.replace("\n"," ")].code;
  d.language_latin = languages[d.results[2].trials[0].response.label.replace("\n"," ")].latin;
  d.vision = vision[d.results[3].trials[0].response.label];
  
  // predefine those first to have reliable order in output
  for (let i=0; i<4; i++) {
    d["station_" + (i+1)] = "";
  }
  for (let s of Object.keys(stations)) {
    d["station_" + s + "_order"] = -1;
  }
  for (let task of Object.keys(tasks)) {
    for (let station of Object.keys(stations)) {
      d[task + "_thresh_" + station] = -1;
    }
  }
  
  for (let i=0; i<4; i++) {
    d["station_" + (i+1)] = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation;
    d["station_" + d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation + "_order"] = i+1;
    
    for (let task of Object.keys(tasks)) {
      let result = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION + tasks[task].offset];
      d[task + "_thresh_" + result.context.targetStation] = parseFloat(result.trials[result.trials.length - 2].condition[tasks[task].attr]);
    }
  }
    
  for (let fname of ignoreFields) {
    delete d[fname];
  }
  return d;
}

function transformTasks(d) {
  
  let results = [];
  
  let means = {};
  
  //get logMAR for participant from snellen task
  let logMAR = Infinity;
  for (let i=0; i<4; i++) {
    let task = tasks["snellen"];
    let res = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION + task.offset];
    let thresh = getThresholdFromTask(res, task.attr); 
    if (thresh < logMAR) {
      logMAR = thresh;
    }
  }
  Dimension.configure({viewingDistance: 300});
  logMAR = Math.log10(Dimension(logMAR/5, "mm").toNumber("arcmin"));
  
  console.log("LogMAR #" + d.participantId + ": " + logMAR.toFixed(3));
  // stations
  for (let i=0; i<4; i++) {
    
    let s = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation;
    stationOrder[s][i] += 1;
    
    for (let task of Object.keys(tasks)) {
      
      let threshAttr = tasks[task].attr;

      // calculate geometric mean
      if (!means[task]) {
        let product = 1;
        for (let j=0; j<4; j++) {
          let res = d.results[STATIONS_OFFSET + j * TASKS_PER_STATION + tasks[task].offset];
          product *= getThresholdFromTask(res, threshAttr);          
        }
        means[task] = Math.pow(product, 1/4);
      }
      
      let mean = means[task];
      
      let result = {};
      let taskResults = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION + tasks[task].offset];
      

      //d["station_" + (i+1)] = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation;
      //d["station_" + d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation + "_order"] = i+1;
    
      result.participantId = d.participantId;
      result.ageGroup = d.results[0].trials[0].response.label;
      result.gender = d.results[1].trials[0].response.label;
      result.language = languages[d.results[2].trials[0].response.label.replace("\n"," ")].code;
      result.language_latin = languages[d.results[2].trials[0].response.label.replace("\n"," ")].latin;
      result.vision = vision[d.results[3].trials[0].response.label];
      
      result.logMAR = logMAR;
      
      result.task = task;
      result.station = taskResults.context.targetStation;
      result.stationOrder = i+1;
      result.stationAndOrder = result.station + result.stationOrder;
      result.resolution = stations[result.station].pixeldensity;
      
      result.threshold = getThresholdFromTask(taskResults, threshAttr);
      result.logThreshold = Math.log10(result.threshold*100);
      
      result.thresholdAverage = mean;
      result.relativeThreshold = result.threshold / mean;
      result.logRelativeThreshold = Math.log10(result.relativeThreshold);
      
      // line_parallel task changed after participant 4, so do not store early results
      if (!(result.task == "line_parallel" && result.participantId < 5)) {
        results.push(result);
      }
    }
  }
    
  return results;
}

function getThresholdFromTask(taskResults, thresholdAttribute) {
  
  let trials = taskResults.trials;
  return parseFloat(trials[trials.length - 2].condition[thresholdAttribute]);

}

async function writeJSON(data) {
  
  outputFilePath += ".json";
  
  let txt = JSON.stringify(data, null, 2);
  
  await fs.writeFile(outputFilePath, txt, "utf8");
  
  console.log("Data written to " + outputFilePath);
}

async function writeCSV(data) {
    
  outputFilePath += ".csv";
  
  await csv.writeToPath(outputFilePath, data, {headers: true});
      
  console.log("Data written to " + outputFilePath);

}