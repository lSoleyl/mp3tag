/** This module implements the logic to parse the given command line arguments
 *  into a task list.
 */
import * as _  from 'lodash';
import TagData from '../tagdata';


const taskDefinitions: {[key:string]: TaskDefinition} = {};

function isTask(param : string) {
  return taskDefinitions[param] !== undefined;
}


export enum TaskType {
  Source = 'source',  // loading the file
  Sink = 'sink',      // saving the file
  
  Read = 'read',      // reading data
  Write = 'write',    // modifying data

  Option = 'option',  // controlling the behavior of other tasks
  Help = 'help'       // special category only for the help task

}

// Task's internal option type
interface Options {
  min_args: number;
  max_args: number;
  type: TaskType;

  arg_display?: string;
  help_text?: string;
};

// The type, which is used as 'options' parameter
type OptionsParam = Partial<Options & {args:number}>;


type SourceTaskAction = (this:Task)=>Promise<TagData>;
type OptionTaskAction = (this:Task)=>Promise<void>;
type GenericTaskAction = (this:Task, data: TagData)=>Promise<void>;
type TaskAction = SourceTaskAction | OptionTaskAction | GenericTaskAction;

class TaskDefinition {

  public options: Options;
  public type: TaskType;

  /** 
   * @param key the task key, which is used to identify the task when parsing cmd args
   * @param options the task's type and parameter options
   * @param action the task function to execute
   */
  constructor(public key: string, options: OptionsParam, public action: TaskAction) {
    this.options = TaskDefinition.verifyOptions(options);
    this.type = this.options.type;
  }

  private static verifyOptions(options: OptionsParam): Options {

    let min_args: number;
    let max_args: number;


    // First special case (no arguments at all)
    if (options.min_args === undefined && options.max_args === undefined && options.args === undefined) {
      min_args = 0;
      max_args = 0;
    } else {
      // Lower bound not defined
      if (options.min_args === undefined) { // calc min_args
        if (options.args !== undefined) {
          min_args = options.args;
        } else {
          min_args = 0; // only max_args or no args defined -> 0 args min
        }
      } else {
        min_args = options.min_args
      }

      // Upper bound not defined
      if (options.max_args === undefined) { // calc max_args
        if (options.args !== undefined) {
          max_args = options.args;
        } else {
          max_args = 99; // min_args was defined so interpret as arbitrary number of arguments
        }
      } else {
        max_args = options.max_args;
      }
    }

    // args is not part of the Options type
    delete options.args;

    return {
      min_args,
      max_args,
      type: options.type ?? TaskType.Read, // default task type is read
      ...options // copy optional properties, which are set
    };
  }

  /** Generates the string for the first column (--<key> <arg_display>) for the command
   *  If fieldSize is given, then the string is filled up with spaces until it reaches the length.
   */
  to_string(fieldSize?: number) {
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


export class Task extends TaskDefinition {
  public args: string[] = [];

  constructor(definition: TaskDefinition) {
    super(definition.key, definition.options, definition.action);
  }

  /** Runs a source task, which generates the tag data to pass to the next tasks
   * 
   * @returns a promise, which resolves to the generated data of this source task
   */
  runSource() {
    return (this.action as SourceTaskAction)();
  }

  /** Runs an option task, which receives no parameters and returns no data
   * 
   * @returns a promise, which resolves once the option task has completed
   */
  runOption() {
    return (this.action as OptionTaskAction)();
  }

  /** Executes this task with the current arguments
   * 
   * @param data the data to pass to the task
   * 
   * @return a promise, which resolves once the task has completed
   */
  run(data:TagData) {
    return (this.action as GenericTaskAction)(data);
  }
 

  /** Reads this tasks arguments from the given argument list.
   *  The number of arguments is defined by min_args and max_args.
   *  Everything, which is not a task keyword itself, can be passed as argument
   *  to the task.
   *
   * @param argv the argument list (excluding the task itself)
   */
  readArgs(argv:string[]) {
    // Read min_args amount of arguments
    while (this.args.length < this.options.min_args) {
      const param = argv[0];
      if (isTask(param)) {
        throw new Error(`Not enough arguments found for '${this.key}' task`);
      }

      this.args.push(param);
      argv.shift();
    }

    // Now read up to max_args optional arguments
    while(argv.length > 0 && this.args.length < this.options.max_args && !isTask(argv[0])) {
      this.args.push(argv.shift() as string); // argv cannot be empty
    }
  }
}


/** Define a task with the set of options and an action. The task is then added to the list
 *  of known tasks
 *
 * @param key the key, which identifies the task (eg. 'in' to use --in)
 * @param options task's type and argument options
 * @param action the action to execute... 
 *               Source actions don't receive an object, but return one and
 *               Sinks receive an object, but don't return anything                
 *               options don't receive and don't return anything
 */
export function defineTask(key: string, options: OptionsParam, action: TaskAction) {
  taskDefinitions['--'+key] = new TaskDefinition(key, options, action);
};

/** Run method, which should be used to start the process
 * 
 * @param argv the command line arguments passed to the script excluding the script call itself.
 * 
 * @return {Promise<void>} resolves once, all tasks have completed
 */
export async function run(argv: string[]) {
  let tasks: Task[] = [];

  while(argv.length > 0) {
    const key = argv.shift() as string;
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
    tasks.push(new Task(taskDefinitions['--help'])); // Execute help if no commands are passed
  }

  

  // Special case... ignore all other tasks if help is specified
  if (_.some(tasks, (task) => { return task.type === TaskType.Help; })) {
    const helpTask = new Task(taskDefinitions['--help']);
    await helpTask.runOption();
    return;
  } 

  // Ensure that we have exactly one source and at most one sink.
  const catTasks = _.groupBy(tasks, task => task.type);
  if (catTasks[TaskType.Source] === undefined || catTasks[TaskType.Source].length !== 1) {
    throw new Error("Wrong arguments passed. A source is required.");
  }

  if (catTasks[TaskType.Sink] !== undefined && catTasks[TaskType.Sink].length > 1) {
    throw new Error("Wrong arguments passed. At most one sink is allowed");
  }

  const sourceTask = catTasks[TaskType.Source][0];
  const sinkTask = catTasks[TaskType.Sink] ? catTasks[TaskType.Sink][0] : undefined;

  const optionTasks = catTasks[TaskType.Option] ?? [];

  // Remove these special tasks form the general task list
  _.remove(tasks, task => task.type === TaskType.Source || task.type === TaskType.Sink || task.type === TaskType.Option);

  // Add the sink task back in as last task (must always be processed at the end)
  if (sinkTask) {
    tasks.push(sinkTask);
  }

  // Now define order of execution...
  // first options, then source, then read or write, then sink
  for (const optionTask of optionTasks) {
    await optionTask.runOption();
  }

  // Load the tag data for the other tasks to manipulate
  const tagData = await sourceTask.runSource();

  // Now execute all remaining tasks in order
  for (const task of tasks) {
    // for all other tasks the current data is just passed in and the result ignored
    await task.run(tagData);
  }

  // All tasks processed
}

const categories = [
  {key:TaskType.Help, description:'Help'},
  {key:TaskType.Option, description:'Options'},
  {key:TaskType.Source, description:'File source commands'},
  {key:TaskType.Read, description:'Reading commands'},
  {key:TaskType.Write, description:'Modifying commands'},
  {key:TaskType.Sink, description:'File target commands (save)'}
];

// Define help-task
defineTask('help', {
  help_text: 'Display this help text',
  type: TaskType.Help
}, async function() {
  // Calculate necessary field size
  let fieldSize = _.max(_.map(taskDefinitions, task => task.to_string().length)) as number;
  fieldSize += 5; // Some additional space between the argument and it's description

  // Group all commands by category
  const cat_commands = _.groupBy(taskDefinitions, task => task.type);

  // Display all commands, ordered by category
  _.each(categories, (cat) => {
    if (cat_commands[cat.key] !== undefined && cat_commands[cat.key].length > 0) {
      console.log(cat.description + ':')

      _.each(cat_commands[cat.key], (command) => {
        console.log(command.to_string(fieldSize) + command.description());
      })
      
      console.log('\n');
    }
  });
});
