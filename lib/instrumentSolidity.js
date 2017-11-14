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
  const propUnequal = (name, value) => object => object[name] !== value
  const wrap = val => Array.isArray(val) ? val : [val]

  // class diagram
  const flatten = ast => {
    const children = wrap(ast.body || ast.expression || ast.left || ast.right || ast.literal || [])
    return [ast].concat(...children.map(flatten))
  }

  const checkType = stmt => {
    
    if(typeof stmt.literal == "string") {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, stmt.literal);
    } else {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, 'mapping(');
      checkType(stmt.literal.from);
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '->');
      checkType(stmt.literal.to);
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ')');
    }
    if(stmt.members && stmt.members.length > 0) {
      stmt.members.forEach( member => {
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '.' + member);
      })

    } 
  } 

  const checkParams = params => {
    
    if(params) {
      
      params.forEach( (param, idx, array) => {

          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, (param.is_storage ? 'fa:fa-database ' : '') + (param.id ? param.id + ' <i>:' : '<i>'));
          checkType(param.literal);
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '</i>');
          if (idx !== array.length - 1){ 
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ', ');
          }
    
      });
    }
  } 

  const contractStatements = flatten(ast).filter(propEquals('type', 'LibraryStatement'))
    .concat(flatten(ast).filter(propEquals('type', 'ContractStatement')))
    .concat(flatten(ast).filter(propEquals('type', 'InterfaceStatement')));


  contractStatements.forEach( stmt => {
    fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + stmt.name + '["<h2>'+ stmt.name + '</h2>');
    if(!contractsAccessibility[stmt.name]) {
      contractsAccessibility[stmt.name] = [];
    }
    
    var svStmts = stmt.body.filter(propEquals('type', 'StateVariableDeclaration'))
    if(svStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />fa:fa-database <b>State Variables</b>');
      svStmts.forEach( svStmt => {

        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;' + (svStmt.visibility === 'public' ? ' fa:fa-plus-square ' : ' fa:fa-minus-square-o ')  + ' <b>' +svStmt.name + '</b> <i>:');
        checkType(svStmt.literal);
                
        contractsAccessibility[stmt.name][svStmt.literal.literal] = true;
        
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '</i>');
      })
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />');
    }

    var eStmts = stmt.body.filter(propEquals('type', 'EventDeclaration'));
    if(eStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />fa:fa-bell <b>Events</b>');
      eStmts.forEach( eStmt => {

        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;&nbsp;<b>' +eStmt.name + '</b>(');
        if(eStmt.params.length>0) {
          checkParams(eStmt.params);
        }
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ')' );
      })
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />');
    }

    var mStmts = stmt.body.filter(propEquals('type', 'ModifierDeclaration'));
    if(mStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />fa:fa-pencil-square <b>Modifier</b>');

      mStmts.forEach( mStmt => {
        
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;&nbsp;<b><u>' +mStmt.name + '</u></b>' );
        if(mStmt.params.length>0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '(' );
          checkParams(mStmt.params);
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ')' );
        }
        
      })
      
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />');
    }

    var fdStmts = stmt.body.filter(propEquals('type', 'FunctionDeclaration'));
    if(fdStmts.length > 0) {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />fa:fa-align-justify <b>Functions</b>');
      fdStmts.forEach( fdStmt => {

        var publicIcon = fdStmt.modifiers.filter(propEquals('name', 'public')).length > 0 ? 'fa:fa-plus-square ' : '';
        var internalIcon = fdStmt.modifiers.filter(propEquals('name', 'internal')).length > 0 ? 'fa:fa-minus-square-o ' : '';
        var constantIcon = fdStmt.modifiers.filter(propEquals('name', 'constant')).length > 0 ? 'fa:fa-eye ' : '';
        var icons = publicIcon + internalIcon + constantIcon;

        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;&nbsp;&nbsp;' + icons + '<b>' + (fdStmt.name != null ? fdStmt.name : "") + '</b>(');
        

        checkParams(fdStmt.params);
    
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ')');
      
        var modifiers = fdStmt.modifiers
          .filter(propUnequal('name', 'public'))
          .filter((propUnequal('name', 'internal')))
          .filter((propUnequal('name', 'constant')));

        if(modifiers.length > 0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' );
          modifiers.forEach( modifier => {

              fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '&nbsp;<u>' + modifier.name + '</u>');
        
          });
        }

        if(fdStmt.returnParams) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:(' );
          checkParams(fdStmt.returnParams);
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, ')' );
        }
        
      })
    }

    fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '"];');

    var structs = stmt.body.filter(propEquals('type', 'StructDeclaration'));
    if(structs.length > 0) {

      structs.forEach( struct => {
        
        var structName = stmt.name + '.' + struct.name;
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + structName + ' .-> ' +stmt.name + ';');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + structName + '("<b>' +  struct.name + '</b> <i>struct</i>');
        if(struct.body.length > 0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />');
          struct.body.forEach(declarativeExpression => {
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />' + declarativeExpression.name + '&nbsp;<i>:');

            checkType(declarativeExpression.literal);
            
            if(declarativeExpression.literal.members.length > 0) {
              declarativeExpression.literal.members.forEach( member => {
                fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '.' + member);
              })
    
            } 

            fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '</i>');
          })
        }
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '");');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\nstyle ' + structName + ' fill:#fffbbb,stroke:#edebbb');
        //fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;' + (fdStmt.name != null ? fdStmt.name : "") + '()');
      })
    }

    var enums = stmt.body.filter(propEquals('type', 'EnumDeclaration'));
    if(enums.length > 0) {

      enums.forEach( enumEntity => {
        
        var enumName = stmt.name + '.' + enumEntity.name;
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + enumName + ' .-> ' +stmt.name + ';');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + enumName + '("<b>' +  enumEntity.name + '</b> <i>enum</i>');
        if(enumEntity.members.length > 0) {
          fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />');
          enumEntity.members.forEach(member => {
            fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />' + member);

          })
        }
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '");');
        fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\nstyle ' + enumName + ' fill:#fffbbb,stroke:#edebbb');

        //fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '<br />&nbsp;&nbsp;' + (fdStmt.name != null ? fdStmt.name : "") + '()');
      })
    }

    stmt.is.forEach( isStmt => {
      fs.appendFileSync(`${workingDir}/coverage/classDiagram.html`, '\n' + stmt.name + ' ==> ' +isStmt.name + ';');
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

