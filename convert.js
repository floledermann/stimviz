
import fs from "fs/promises";
import path from "path";
import csv from "@fast-csv/format";


let dataDir = "testdata/experiment-1";
let outputFilePath = path.join(dataDir, "all");

const MIN_ID = 2;
const MAX_ID = null;

let output = [];
let outputFunc = writeCSV;

let id = MIN_ID;
let fileName = null;


while( !MAX_ID || (id < MAX_ID)) {
  
  fileName = "user_" + id.toLocaleString('en',{minimumIntegerDigits:3}) + ".json";
  let filePath = path.join(dataDir, fileName);
  
  try {
    let data = JSON.parse(await fs.readFile(filePath, "utf8"));
    output.push(transformUser(data));
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
  
  id++;
  
};

console.log();
console.log(output.length + " records read");

outputFunc(output);

function transformUser(d) {
  
  const languages = {
    "English": {code: "en", latin: true},
    "German": {code: "de", latin: true},
    "Other Asian or African": {code: "asian", latin: false},
    "Other European or Latin American": {code: "latin", latin: true},
    "Chinese": {code: "cn", latin: false},
    "Japanese": {code: "jp", latin: false},
    "Greek": {code: "gr", latin: false},
    "Russian or other cyrillic": {code: "ru", latin: false},
  }
  
  const vision = {
    "Normal vision": "normal",
    "Corrected to normal\n(wearing glasses or contact lenses suitable for reading)": "corrected",
    "Short-sighted\n(far objects appear blurred)": "short-sighted",
    "Far-sighted\n(near objects appear blurred)": "far-sighted",
    "Other vision impairment": "impaired",
    "Would prefer not to answer": "no-answer"
  }
  
  d.ageGroup = d.results[0].trials[0].response.label;
  d.gender = d.results[1].trials[0].response.label;
  d.language = languages[d.results[2].trials[0].response.label.replace("\n"," ")].code;
  d.language_latin = languages[d.results[2].trials[0].response.label.replace("\n"," ")].latin;
  d.vision = vision[d.results[3].trials[0].response.label];
  
  const stations = {
    "A": {pixeldensity: 343},
    "B": {pixeldensity: 807},
    "C": {pixeldensity: 236},
    "D": {pixeldensity: 520}
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
  
  // predefine those first to have reliable order in output
  for (let i=0; i<4; i++) {
    d["station_" + (i+1)] = "";
  }
  for (let s of Object.keys(stations)) {
    d["station_" + s + "_order"] = -1;
  }
  
  for (let i=0; i<4; i++) {
    d["station_" + (i+1)] = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation;
    d["station_" + d.results[STATIONS_OFFSET + i * TASKS_PER_STATION].context.targetStation + "_order"] = i+1;
    
    for (let task of Object.keys(tasks)) {
      let result = d.results[STATIONS_OFFSET + i * TASKS_PER_STATION + tasks[task].offset];
      d[task + "_thresh_" + result.context.targetStation] = parseFloat(result.trials[result.trials.length - 2].condition[tasks[task].attr]);
    }
  }
  
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
  
  for (let fname of ignoreFields) {
    delete d[fname];
  }
  return d;
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