const SolidityParser = require('solidity-parser-sc');
const preprocessor = require('./preprocessor');
const injector = require('./injector');
const parse = require('./parse');
const fs = require('fs');
const path = require('path');

module.exports = function instrumentSolidity(contractSource, fileName, workingDir, contractsAccessibility) {
  const contract = {};
  contract.source = contractSource;
  contract.instrumented = contractSource;

  contract.runnableLines = [];
  contract.fnMap = {};
  contract.fnId = 0;
  contract.branchMap = {};
  contract.branchId = 0;
  contract.statementMap = {};
  contract.statementId = 0;
  contract.injectionPoints = {};

  // First, we run over the original contract to get the source mapping.
  let ast = SolidityParser.parse(contract.source);
  parse[ast.type](contract, ast);
  const retValue = JSON.parse(JSON.stringify(contract));

  const propEquals = (name, value) => object => object[name] === value
  const wrap = val => Array.isArray(val) ? val : [val]

  // class diagram
  const flatten = ast => {
    const children = wrap(ast.body || ast.expression || ast.left || ast.right || ast.literal || [])
    return [ast].concat(...children.map(flatten))
  }

  const contractStatements = flatten(ast).filter(propEquals('type', 'LibraryStatement'))
    .concat(flatten(ast).filter(propEquals('type', 'ContractStatement')))
    .concat(flatten(ast).filter(propEquals('type', 'InterfaceStatement')));


  contractStatements.forEach( stmt => {
    fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + stmt.name + '["<b>'+ stmt.name + '</b>');
    if(!contractsAccessibility[stmt.name]) {
      contractsAccessibility[stmt.name] = [];
    }
    
    var svStmts = stmt.body.filter(propEquals('type', 'StateVariableDeclaration'))
    if(svStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br /><br />State Variables');
      svStmts.forEach( svStmt => {
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' + (svStmt.visibility === 'public' ? '+' : '-')  + ' ' +svStmt.name + ' <i>:' + svStmt.literal.literal);
        if(svStmt.literal.members.length > 0) {
          svStmt.literal.members.forEach( member => {
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '.' + member);
          })

        } 
        
        contractsAccessibility[stmt.name][svStmt.literal.literal] = true;
        
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '</i>');
      })
    }

    var eStmts = stmt.body.filter(propEquals('type', 'EventDeclaration'));
    if(eStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br /><br />Events');
      eStmts.forEach( eStmt => {
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' +eStmt.name + '()');
      })
    }

    var mStmts = stmt.body.filter(propEquals('type', 'ModifierDeclaration'));
    if(mStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br /><br />Modifier');
      mStmts.forEach( mStmt => {
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' +mStmt.name + '()');
      })
    }

    var fdStmts = stmt.body.filter(propEquals('type', 'FunctionDeclaration'));
    if(fdStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br /><br />Functions');
      fdStmts.forEach( fdStmt => {
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' + (fdStmt.name != null ? fdStmt.name : "") + '()');
      })
    }

    fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '"];');

    var structs = stmt.body.filter(propEquals('type', 'StructDeclaration'));
    if(structs.length > 0) {

      structs.forEach( struct => {
        
        var structName = stmt.name + '.' + struct.name;
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + structName + ' .-> ' +stmt.name + ';');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + structName + '("<b>' +  struct.name + '</b> <i>struct</i>');
        if(struct.body.length > 0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />');
          struct.body.forEach(declarativeExpression => {
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />' + declarativeExpression.name + '&nbsp;<i>:' + declarativeExpression.literal.literal);
            if(declarativeExpression.literal.members.length > 0) {
              declarativeExpression.literal.members.forEach( member => {
                fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '.' + member);
              }) 
            }
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '</i>');
          })
        }
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '");');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\nstyle ' + structName + ' fill:#ede890');
        //fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' + (fdStmt.name != null ? fdStmt.name : "") + '()');
      })
    }

    var enums = stmt.body.filter(propEquals('type', 'EnumDeclaration'));
    if(enums.length > 0) {

      enums.forEach( enumEntity => {
        
        var enumName = stmt.name + '.' + enumEntity.name;
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + enumName + ' .-> ' +stmt.name + ';');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + enumName + '("<b>' +  enumEntity.name + '</b> <i>enum</i>');
        if(enumEntity.members.length > 0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />');
          enumEntity.members.forEach(member => {
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />' + member);

          })
        }
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '");');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\nstyle ' + enumName + ' fill:#ede890');

        //fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '<br />&nbsp;&nbsp;' + (fdStmt.name != null ? fdStmt.name : "") + '()');
      })
    }

    stmt.is.forEach( isStmt => {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.mmd`, '\n' + stmt.name + ' ==> ' +isStmt.name + ';');
    })

  })

  // Now, we reset almost everything and use the preprocessor first to increase our effectiveness.
  contract.runnableLines = [];
  contract.fnMap = {};
  contract.fnId = 0;
  contract.branchMap = {};
  contract.branchId = 0;
  contract.statementMap = {};
  contract.statementId = 0;
  contract.injectionPoints = {};

  contract.preprocessed = preprocessor.run(contract.source);
  contract.instrumented = contract.preprocessed;

  ast = SolidityParser.parse(contract.preprocessed);

  const contractStatement = ast.body.filter(node => (node.type === 'ContractStatement' ||
                                                     node.type === 'LibraryStatement'));
  contract.contractName = contractStatement[0].name;

  parse[ast.type](contract, ast);

  // We have to iterate through these injection points in descending order to not mess up
  // the injection process.
  const sortedPoints = Object.keys(contract.injectionPoints).sort((a, b) => b - a);
  sortedPoints.forEach(injectionPoint => {
    // Line instrumentation has to happen first
    contract.injectionPoints[injectionPoint].sort((a, b) => {
      const eventTypes = ['openParen', 'callBranchEvent', 'callEmptyBranchEvent', 'callEvent'];
      return eventTypes.indexOf(b.type) - eventTypes.indexOf(a.type);
    });
    contract.injectionPoints[injectionPoint].forEach(injection => {
      injector[injection.type](contract, fileName, injectionPoint, injection);
    });
  });
  retValue.runnableLines = contract.runnableLines;
  retValue.contract = contract.instrumented;
  retValue.contractName = contractStatement[0].name;

  return retValue;
};
