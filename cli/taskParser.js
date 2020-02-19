/** This module implements the logic to parse the given command line arguments
 *  into a task list.
 */
const _ = require('lodash');


const taskDefinitions = {};

function isTask(param) {
  return typeof(param) === 'string' && taskDefinitions[param] !== undefined;
}

class TaskDefinition {
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
    var result = '  --' + this.key;
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
   */
  run(object, callback) {
    process.nextTick(() => {
      if (this.type === 'option' || this.type === 'source' || this.type === 'help') {
        this.action(callback); // Only a completion callback
      } else {
        this.action(object, callback); // Argument and callback
      }
    });
  }
 

  /** Reads this tasks arguments from the given argument list.
   *  The number of arguments is defined by min_args and max_args.
   *  Everything, which is not a task keyword itself, can be passed as argument
   *  to the task.
   *
   * @param argv the argument list (excluding the task itself)
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
 * @param key the key, which identifies the task (eg. 'in' to use --in)
 * @param options {min_args,args,max_args,type(option,source,read,write,sink,help)}
 * @param action(object,cb(err,obj)) the action to execute... 
 *                 Source don't receive an object, but return one and
 *                 Sinks receive an object, but don't return anything                
 *                 options don't receive and don't return anything
 */
module.defineTask = function(key, options, action) {
  taskDefinitions['--'+key] = new TaskDefinition(key, options, action);
};

/** Run method, which should be used to start the process
 */
module.run = function(argv, callback) {
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

  // Completion function
  const done = function(err,res) { if (typeof(callback) === 'function') callback(err,res); };


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
  // Callback to execute next task
  const nextTask = function nextTask(err) {
    // Error occurred, return it to the calling callback
    if (err) {
      return done(err);
    }

    if (tasks.length > 0) {
      const task = tasks.shift(); // Take next task from list
      if (task.type !== 'source') {
        return task.run(data, nextTask);
      }

      return task.run(null, (err, res) => {
        if (err) {
          return done(err);
        }

        data = res; // Set the source task's result as new data
        nextTask(); // Continue task execution
      });
    } 
      
    // Call callback on completion
    return done();
  }


  nextTask();
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
}, function(cb) {
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

  cb();
});
