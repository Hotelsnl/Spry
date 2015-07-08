/**
 * Gruntfile.js
 *
 * To use this file, you must install Grunt and its dependencies using
 * `npm install .` -- this uses package.json.
 * After npm is done, you can run `grunt` from the current directory.
 */
module.exports = function (grunt) {
  'use strict';

  grunt.log.subhead('Preparing Grunt configuration');

  var file = require('file')
    , fs = require('fs')
    , path = require('path')
    , _ = require('underscore')
    , pathSeparator = path.sep
      // Ensure the correct template root is used, when dealing
      // with the symlink for the Gruntfile.
      // We do not want to let the mobile grunt process use responsive templates.
    , templateDir = path.resolve('.')
    , fileOptions = {'encoding': 'UTF-8'}
    , gruntBuildFile = 'grunt.json'
      // Location of stylus variables.
    , stylusVariables = [templateDir, 'frags/common/css/vars.styl'].join('/')
      // Location of the sprite injector.
    , spriteInjector = [templateDir, 'build/tools/injectSprite'].join('/')
      // Location of the versions.ini.
    , versionsIni = '/www/hotelmodules/versions.ini'
      // The assignment of a CSS version.
    , iniVersionAssignment = 'css_version='
    , stylusVersionVariable = '$version'
    , stylusVersionAssignment = [stylusVersionVariable, ' = '].join('')
    , stylusUrlEmbedder = 'embedUrl'
    , versionBumpFiles = [versionsIni]
      // JS hint RC.
    , jsHintFile = [templateDir, '.jshintrc'].join('/')
      // A list of automatically detected build files.
    , buildFiles = {}
      // A list of all applicable grunt files.
      // This becomes a list of the current file and all external build files.
    , gruntFiles = [
          __filename
        , jsHintFile
      ]
    , currentFile
      // The wrapper for our in-house sly base.
    , jsWrapper = [
          "('sly' in this ? sly : (sly = [])).push(function slyify (sly) {\n"
        , "\n});"
      ]
    , concatSeparator = ';'
      // Extensions per environment and medium.
    , extensions = {
        dev: {
          js: '.dev.js',
          css: '.dev.css'
        },
        min: {
          js: '.min.js',
          css: '.min.css'
        }
      }
      // A line holding a comment.
    , commentExpression = /\s*\/\/(.*?)/i
      // Test if any of the glob patterns are found in a given string.
    , globExpression = /\*|\?|\{|\}|\!/i
    , missingCoreFiles = 0;

  // Log the settings we will use for this Grunt session.
  _.each(
      {
          'Template root': templateDir
        , 'Grunt file': __filename
        , 'Grunt build file': gruntBuildFile
        , 'Initial grunt file list': JSON.stringify(gruntFiles)
        , 'File options': JSON.stringify(fileOptions)
        , 'JS hint RC': jsHintFile
        , 'JS Wrapper': jsWrapper.join('  /* Code goes here */')
        , 'JS concat separator': concatSeparator
        , 'JS extension development': extensions.dev.js
        , 'JS extension production': extensions.min.js
        , 'Stylus variables': stylusVariables
        , 'Sprite injector': spriteInjector
        , 'Stylus data-uri url()': [stylusUrlEmbedder, '()'].join('')
        , 'Versions INI': versionsIni
        , 'INI version assignment': iniVersionAssignment
        , 'Stylus version assignment': stylusVersionAssignment
        , 'CSS extension development': extensions.dev.css
        , 'CSS extension production': extensions.min.css
        , 'Comment expression': commentExpression.source
        , 'Globbing pattern expression': globExpression.source
      },
      function (setting, key) {
        grunt.log.ok(
          grunt.log.table([30, 70], [key, setting])
        );
      }
  );

  grunt.log.subhead('Checking core files');

  // Check if all necessary files exist.
  _.each(
      [jsHintFile]
    , function (file) {
      if (!fs.existsSync(file)) {
        missingCoreFiles += 1;
        grunt.log.error(file);
      } else {
        grunt.log.ok(file);
      }
    }
  );

  if (missingCoreFiles === 0) {
    grunt.log.ok('All core files are present');
  } else {
    grunt.log.error(
      'Missing %numFiles% core files'.replace(
          '%numFiles%'
        , missingCoreFiles
      )
    );
    process.exit(1);
  }

  grunt.log.subhead('Fetching build files');

  // Do this synchronously, so our grunt config waits.
  file.walkSync(templateDir, function (path, directories, files) {
    grunt.verbose.ok('Entering directory:\t' + path);

    files.forEach(function (file) {
      // Not a match.
      if (file !== gruntBuildFile) {
        return;
      }

      currentFile = [path, file].join(pathSeparator);

      // Load in the build file.
      buildFiles[currentFile] = _.filter(
        fs.readFileSync(
          currentFile,
          fileOptions
        ).split('\n'),
        // Filter out all comment lines.
        function (line) {
          return !commentExpression.test(line);
        }
      ).join('\n');

      // Add the current file to the list of grunt files.
      gruntFiles.push(currentFile);
      grunt.log.ok(currentFile.replace(templateDir, '.'));
    });

    grunt.verbose.ok('Leaving directory:\t' + path);
  });

  grunt.verbose.subhead('Loading Grunt tasks');

  require('matchdep')
    .filterDev('grunt-*')
    .forEach(function (task) {
      grunt.verbose.write(
        grunt.log.table([29, 1], [task, ' '])
      );
      grunt.loadNpmTasks(task);
      grunt.verbose.ok();
    });

  // All front end configuration goes here. No need to bother with anything
  // outside this object, unless something is broken.
  // This keeps the template configuration outside of the grunt configuration
  // and task management.
  // Note that all grunt.json files are merged into this object.
  var applications = {
        // The current file needs some extra love and attention.
        // We do not want fail in our builder.
        'gruntfile': {
          js: {
            options: { reload: true },
            src: gruntFiles,
            // Simply apply a JS hinter on our Grunt file.
            rules: ['jshint']
          }
        }
      }
      // Will be populated on-the-fly based on registered applications.
    , tasks = {
        'default': ['watch']
      }
    , task
    , taskName
      // List of all application level tasks.
    , aTasks
      // List of all media level tasks.
    , mTasks = {
        js: [],
        css: [],
        img: []
      }
    , watchFiles = []
      // The basic Grunt configuration. Will be extended on-the-fly.
    , configuration = {
        // JS hinting.
        jshint: {
          options: { jshintrc: jsHintFile }
        },

        // Concatenations of multiple files into one.
        concat: {},

        // Compress and minify the JavaScript.
        uglify: {
          options: { compress: true, mangle: true}
        },

        // Prepare a wrapper for out JavaScript files.
        wrap: {
          options: {
            wrapper: jsWrapper
          }
        },

        // Pre-process stylus into CSS.
        stylus: {
          options: {
            // Do not show line numbers.
            linenos: false,
            // Do not compress. Let the CSS minifier handle this.
            compress: false,
            // Always import the nib library for extended Stylus support.
            // @see http://visionmedia.github.io/nib/
            import: ['nib'],
            // Replace the url() with this entry whenever you want to inject the image.
            urlfunc: stylusUrlEmbedder
          }
        },

        // CSS minifier.
        cssmin: {
          options: { keepSpecialComments: 0 }
        },

        // File watcher.
        watch: {
          options: {
            spawn: false
          }
        },

        // A custom toucher rule.
        touch: {
          options: {
            create: false
          }
        },

        // Configure executable commands.
        // This cannot be abused by external configuration, so long as we do not
        // add a rule processor for exec.
        exec: {
          // Command for applying a version bump.
          versionbump: {
            cmd: function () {
              var variables = fs.readFileSync(
                    stylusVariables,
                    fileOptions
                  ).split('\n')
                  // Read the new CSS version.
                , version = _.reduce(
                    fs.readFileSync(
                      versionsIni,
                      fileOptions
                    ).split('\n'),
                    // Walk all lines in search of the target line.
                    function (memo, line) {
                      // No CSS version found.
                      if (line.indexOf(iniVersionAssignment) !== 0) {
                        return memo;
                      }

                      // Add the version to the memo.
                      return [memo, line.split(iniVersionAssignment)[1]].join('');
                    },
                    // Start with a blank memo.
                    ''
                  );

              // Now we look for the version variable and update it.
              variables = _.map(variables, function (v) {
                // Nothing to do with this variable.
                if (v.indexOf(stylusVersionVariable) !== 0) {
                  return v;
                }

                return [stylusVersionAssignment, "'", version, "'"].join('');
              }).join('\n').trim();

              // Update the stylus variables.
              fs.writeFileSync(
                stylusVariables,
                // Add a trailing newline for consistency.
                [variables, '\n'].join(''),
                fileOptions
              );

              // Exec expects us to build a system call.
              // Let's keep it simple and echo the new version number.
              return ['echo Version bumped to ', version].join('');
            }
          }
        }
      }
      // A list of aliases for rules and their corresponding configuration.
    , ruleAliases = {
        // Injecting sprites is simply using an exec call.
        'injectsprite': 'exec'
      }
    , ruleAlias
      // Process a given rule with options and return a configuration for it.
    , ruleProcessors = {
        jshint: function (options) {
          return {
            src: options.src
          };
        },
        concat: function (options) {
          return {
            options: { separator: concatSeparator },
            src: options.src,
            dest: [options.dest, extensions.dev[options.extension]].join('')
          };
        },
        // This needs to be done before you uglify the code.
        wrap: function (options) {
          return {
            src: [options.dest, extensions.dev.js].join(''),
            dest: [options.dest, extensions.dev.js].join('')
          };
        },
        uglify: function (options) {
          return {
            src: [options.dest, extensions.dev.js].join(''),
            dest: [options.dest, extensions.min.js].join('')
          };
        },
        stylus: function (options) {
          return {
            src: options.src,
            dest: [options.dest, extensions.dev.css].join('')
          };
        },
        cssmin: function (options) {
          return {
            src: [options.dest, extensions.dev.css].join(''),
            dest: [options.dest, extensions.min.css].join('')
          };
        },
        injectsprite: function (options) {
          var command = [
            spriteInjector,
            '--image',
            _.first(options.src),
            '--stylus',
            options.dest
          ];

          if ('retina' in options && options.retina === true) {
            command.push('--retina');
          }

          return { cmd: command.join(' ') };
        },
        touch: function (options) {
          var files = [];

          if (!!options.dest) {
            _.each(
              extensions, function (envExtensions) {
                _.each(
                  envExtensions, function (extension) {
                    files.push([options.dest, extension].join(''));
                  }
                );
              }
            );
          }

          return {
            src: files
          };
        }
      }
    , applyRule = function (rule, task, options) {
        if (!(rule in ruleProcessors)) {
          return grunt.log.error('Missing rule', rule);
        }

        // Use an alias for the rule where applicable.
        ruleAlias = rule in ruleAliases ? ruleAliases[rule] : rule;

        configuration[ruleAlias][task] = ruleProcessors[rule](options);

        grunt.log.ok(ruleAlias, task);
      }
    , prepareRuleMapper = function (taskName, medium) {
        return function (rule) {
          var taskEntry = [rule, taskName].join(':');
          applyRule(rule, taskName, medium);
          return taskEntry;
        };
      }
    , fixPathSeparator = function (file) {
        return file.replace('/', pathSeparator);
      };

  // Merge the build files with the applications.
  _.each(buildFiles, function (json, file) {
    var config;

    grunt.log.subhead([
        '[Parse]'
      , grunt.log.wordlist(
            [file.replace(templateDir, '.')]
          , {'color': 'cyan'}
        )
    ].join(' '));

    try {
      config = JSON.parse(json);
    } catch (error) {
      return grunt.log.error(error.message);
    }

    _.each(
      _.keys(config),
      // We cannot directly pass grunt.log.ok, since that would pass along
      // the key as second argument, which has no value to us, but will be interpreted
      // by the grunt logger as a structure key.
      function (value) {
        grunt.log.ok(value);
      }
    );

    _.extend(applications, config);
  });

  // Walk through all applications and both configure and register them.
  _.each(applications, function (application, a) {
    // Application level tasks.
    aTasks = [];

    _.each(application, function (medium, m) {
      grunt.log.subhead([
          '[Rules:'
        , m
        , '] '
        , grunt.log.wordlist([a], {'color': 'cyan'})
      ].join(''));

      // Fix the paths of source and destination files.
      if ('src' in medium) {
        medium.src = medium.src.map(fixPathSeparator);

        // Test if all source files exist.
        _.each(medium.src, function (file) {
          // If there is a globbing pattern in our file name, the file does not
          // have to exist.
          // @see http://gruntjs.com/configuring-tasks#globbing-patterns
          if (globExpression.test(file)) {
            return;
          }

          if (!fs.existsSync(file)) {
            grunt.log.error(['Missing source file', file].join(': '));
            process.exit(1);
          }
        });
      }

      if ('dest' in medium) {
        medium.dest = fixPathSeparator(medium.dest);
      }

      if ('bump' in medium && medium.bump === true) {
        versionBumpFiles = versionBumpFiles.concat(medium.src);
      }

      if ('rules' in medium) {
        // Create a new task name.
        taskName = [a, m].join('.');
        mTasks[m].push(taskName);
        watchFiles = [];

        // Add ourselves to the watchlist, unless explicitly prevented.
        if (!('watch' in medium) || medium.watch !== false) {
          // By default, listen to all source files.
          if ('src' in medium) {
            watchFiles = watchFiles.concat(medium.src);
          }

          // And if applicable, listen to additional watch files.
          if (_.isArray(medium.watch)) {
            watchFiles = watchFiles.concat(medium.watch);
          }

          if (watchFiles.length) {
            // Create a basic watcher.
            configuration.watch[taskName] = {
              files: watchFiles,
              tasks: [taskName]
            };

            // If we have custom options, apply them now.
            if ('options' in medium) {
              configuration.watch[taskName].options = medium.options;
            }
          }
        }

        tasks[taskName] = medium.rules.map(
          prepareRuleMapper(
            taskName,
            _.extend(medium, {'extension': m})
          )
        );

        aTasks.push(taskName);
      }
    });

    if (aTasks.length) {
      tasks[a] = aTasks;
    }
  });

  // Ensure that aliases for tasks work by registering them as redirects.
  _.each(ruleAliases, function (rule, alias) {
    tasks[alias] = [rule];
  });

  // Walk through all medium specific tasks.
  _.each(mTasks, function (taskList, medium) {
    // Skip empty medium tasks.
    if (taskList.length < 1) {
      return;
    }

    tasks[['all', medium].join('-')] = taskList;
  });

  // If we have a CSS group. apply versionbumping on it.
  if ('all-css' in tasks) {
    // Add a task for versionbumping.
    tasks.versionbump = ['exec:versionbump', 'all-css'];

    // And watch the versions INI for changes.
    configuration.watch.versionbump = {
      files: versionBumpFiles,
      tasks: ['versionbump']
    };
  }

  // After all that preparation, let grunt initialize the configuration.
  grunt.initConfig(configuration);

  grunt.log.subhead('Registering tasks');

  // Create a task for touching files.
  grunt.registerMultiTask(
    'touch',
    'Touch specified files so they can trigger a call chain',
    function () {
      var options = this.options(),
        delay = options.delay || 1000,
        src = this.filesSrc || this.data.src,
        now = (+(new Date()) / 1000) + delay;

      setTimeout(function () {
        _.each(src, function (file) {
          if (fs.existsSync(file)) {
            fs.utimesSync(file, now, now);
            grunt.log.ok('Touched: ' + file);
          } else if (!!options.create || !!this.data.create) {
            fs.writeFileSync(file, '', fileOptions);
            grunt.log.ok('Created: ' + file);
          } else {
            grunt.log.warn('File does not exist: ' + file);
          }
        });
      }, delay);
    }
  );

  // Register all tasks.
  _.each(tasks, function (task, name) {
    grunt.log.ok(name);
    grunt.registerTask(name, task);
  });
};
