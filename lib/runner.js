#!/usr/bin/env node

const chalk = require('chalk');
const {getElmFiles, writeElmFiles} = require('./elm-files');

const interpretReport = (args, report) => {
  // TODO Document color disabling
  const colorEnabled = args.color === undefined;
  return report
    .map(part => {
      const chalkWithColor =
        part.color && colorEnabled
          ? chalk.rgb(part.color[0], part.color[1], part.color[2])
          : chalk;
      return chalkWithColor(part.string);
    })
    .join('');
};

function requestLintResult(app, elmFiles) {
  const filesPendingReceiptAcknowledgement = new Set(
    elmFiles.map(file => file.path)
  );

  return new Promise(resolve => {
    app.ports.acknowledgeFileReceipt.subscribe(fileName => {
      filesPendingReceiptAcknowledgement.delete(fileName);

      if (filesPendingReceiptAcknowledgement.size === 0) {
        app.ports.resultPort.subscribe(resolve);
        app.ports.requestToLint.send(true);
      }
    });

    elmFiles.forEach(file => {
      app.ports.collectFile.send(file);
    });
  });
}

function logFileFixResult(result) {
  if (result.fixedFiles.length > 0) {
    // TODO Add header like `-- ELM-LINT FIX REPORT ------`
    // TODO Use module name for each file instead of the path
    const fixedFiles = result.fixedFiles
      .map(file => `  - ${file.path}`)
      .join('\n');

    console.log(
      `I automatically fixed some problems in the following files:\n${fixedFiles}\n`
    );
  }

  return result;
}

function runLinting(args, Elm) {
  const elmFiles = getElmFiles([]);

  if (elmFiles.length === 0) {
    console.error('I could not find any files to lint.');
    process.exit(1);
  }

  const app = Elm.Elm.Main.init({
    flags: {
      fixMode: args['fix-all'] ? 'fix-all' : 'dontfix'
    }
  });

  app.ports.abort.subscribe(errorMessage => {
    console.error(errorMessage);
    process.exit(1);
  });

  return requestLintResult(app, elmFiles).then(result => {
    console.log(interpretReport(args, result.report));
    return writeElmFiles(result.fixedFiles)
      .then(() => logFileFixResult(result))
      .then(() => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error(error);
        process.exit(1);
      });
  });
}

module.exports = runLinting;