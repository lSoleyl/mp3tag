/** This module implements the logic to parse the given command line arguments
 *  into a task list.
 */
const _ = require('lodash');


const taskDefinitions = {};

function isTask(param) {
  return typeof(param) === 'string' && taskDefinitions[param] !== undefined;
}


/** @typedef {{args:number, min_args:number, max_args:number, type:string}} Options
 */

/** @typedef {(data:TaskData)=>Promise<TaskData>} ActionFn
 */

class TaskDefinition {

  /** 
   * @param {string} key the task key, which is used to identify the task when parsing cmd args
   * @param {Options} options the task's type and parameter options
   * @param {ActionFn} action the task function to execute
   */
  constructor(key, options, action) {
    this.key = key;
    this.options = this.verifyOptions(options);
    this.type = options.type;
    this.action = action;
  }

  verifyOptions(options) {
    options = options || {};
    // First special case (no arguments at all)
    if (options.min_args === undefined && options.max_args === undefined && options.args === undefined) {
      options.min_args = 0;
      options.max_args = 0;
    }
    // Lower bound not defined
    if (options.min_args === undefined) { // calc min_args
      if (options.args !== undefined) {
        options.min_args = options.args;
      } else {
        options.min_args = 0; // only max_args or no args defined -> 0 args min
      }
    }
    // Upper bound not defined
    if (options.max_args === undefined) { // calc max_args
      if (options.args !== undefined) {
        options.max_args = options.args;
      } else {
        options.max_args = 99; // min_args was defined so interpret as arbitrary number of arguments
      }
    }

    if (typeof(options.type) !== 'string') {
      options.type = 'read';
    }

    return options;
  }

  /** Generates the string for the first column (--<key> <arg_display>) for the command
   *  If fieldSize is given, then the string is filled up with spaces until it reaches the length.
   */
  to_string(fieldSize) {
    let result = '  --' + this.key;
    if (typeof(this.options.arg_display) === 'string') {
      result += ' ' + this.options.arg_display;
    }

    if (fieldSize) {
      while (result.length < fieldSize) {
        result += ' ';
      }
    }

    return result;
  }

  description() {
    if (typeof(this.options.help_text) === 'string') {
      return this.options.help_text;
    }

    return '<no description>';
  }
}


class Task extends TaskDefinition {
  constructor(definition) {
    super(definition.key, definition.options, definition.action);
    this.args = [];
  }

  /** Executes this task with the current arguments
   * 
   * @param {TagData?} data the optional data to pass to the task
   * 
   * @return {Promise<TagData>} resolves to the result of the task's action
   */
  run(data) {
    return this.action(data);
  }
 

  /** Reads this tasks arguments from the given argument list.
   *  The number of arguments is defined by min_args and max_args.
   *  Everything, which is not a task keyword itself, can be passed as argument
   *  to the task.
   *
   * @param {string[]} argv the argument list (excluding the task itself)
   */
  readArgs(argv) {
    //Read min_args amount of arguments
    while (this.args.length < this.options.min_args) {
      var param = argv[0];
      if (isTask(param)) {
        throw new Error("Not enough arguments found for '" + this.key + "' task");
      }

      this.args.push(param);
      argv.shift();
    }

    //Now read up to max_args optional arguments
    while(this.args.length < this.options.max_args && !isTask(argv[0])) {
      this.args.push(argv.shift());
    }
  }
}





// Define module
var module = module.exports = {};

/** Define a task with the set of options and an action. The task is then added to the list
 *  of known tasks
 *
 * @param {string} key the key, which identifies the task (eg. 'in' to use --in)
 * @param {Options} options task's type and argument options
 * @param {ActionFn} action the action to execute... 
 *                 Source actions don't receive an object, but return one and
 *                 Sinks receive an object, but don't return anything                
 *                 options don't receive and don't return anything
 */
module.defineTask = function(key, options, action) {
  taskDefinitions['--'+key] = new TaskDefinition(key, options, action);
};

/** Run method, which should be used to start the process
 * 
 * @param {string[]} argv the command line arguments passed to the script excluding the script call itself.
 * 
 * @return {Promise<void>} resolves once, all tasks have completed
 */
module.run = async function(argv) {
  let tasks = [];

  while(argv.length > 0) {
    const key = argv.shift();
    if (taskDefinitions[key] !== undefined) {
      const task = new Task(taskDefinitions[key]);
      task.readArgs(argv);
      tasks.push(task);
    } else {
      throw new Error("Passed unknown task '" + key + "' as argument.");
    }
  }

  // Validate and execute task list
  if (tasks.length == 0) {
    tasks.push(taskDefinitions['--help']); // Execute help if no commands are passed
  }

  let sourceTask;
  let sinkTask;
  let optionTasks;

  //Special case... ignore all other tasks if help is specified
  if (_.some(tasks, (task) => { return task.type === 'help'; })) {
    tasks = [ taskDefinitions['--help'] ];
  } else {
    //Ensure that we have exactly one source and at most one sink.
    const catTasks = _.groupBy(tasks, (task) => { return task.type; });
    if (catTasks['source'] === undefined || catTasks['source'].length !== 1) {
      throw new Error("Wrong arguments passed. A source is required.");
    }

    if (catTasks['sink'] !== undefined && catTasks['sink'].length > 1) {
      throw new Error("Wrong arguments passed. At most one sink is allowed");
    }

    sourceTask = catTasks['source'][0];
    sinkTask = catTasks['sink'] ? catTasks['sink'][0] : undefined;

    optionTasks = catTasks['option'];

    _.remove(tasks, (task) => { return task.type === 'source' || task.type === 'sink' || task.type === 'option'; });

    //Now define order of execution...
    // first options, then source, then read or then write, then sink
    const sortedTasks = optionTasks || [];
    sortedTasks.push(sourceTask);
    _.each(tasks, (task) => { sortedTasks.push(task) });
    if (sinkTask) {
      sortedTasks.push(sinkTask);
    }
    tasks = sortedTasks;
  }

  let data; // The data to manipulate (gets set by the source task)

  // Now execute all tasks in order
  for (const task of tasks) {
    if (task.type === 'source') {
      // source task will set the data to pass to the following tasks
      data = await task.run();
    } else {
      // for all other tasks the current data is just passed in and the result ignored
      await task.run(data);
    }
  }

  // All tasks processed
  return;
}

const categories = [
  {key:'help', description:'Help'},
  {key:'options', description:'Options'},
  {key:'source', description:'File source commands'},
  {key:'read', description:'Reading commands'},
  {key:'write', description:'Modifying commands'},
  {key:'sink', description:'File target commands (save)'}
];

//Define help-task
module.defineTask('help', {
  help_text: 'Display this help text',
  type:'help'
}, async function() {
  //Calculate necessary field size
  const fieldSize = _.max(_.map(taskDefinitions, (task) => { return task.to_string().length; } ));
  fieldSize += 5 //Some additional space between the argument and it's description

  //Group all commands by category
  const cat_commands = _.groupBy(taskDefinitions, (task) => { return task.type; });

  //Display all commands, ordered by category
  _.each(categories, (cat) => {
    if (cat_commands[cat.key] !== undefined && cat_commands[cat.key].length > 0) {
      console.log(cat.description + ':')

      _.each(cat_commands[cat.key], (command) => {
        console.log(command.to_string(fieldSize) + command.description());
      })
      
      console.log('\n');
    }
  });

  return;
});
