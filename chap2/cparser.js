var cparser={

// Checks precedence of an operator
precedence:(function(op) {
  switch(op) {
    case "^": return 4;
    case "chs": return 3;
    case "*": case "/": return 2;
    case "+": case "-": return 1;
    default: return 0;
  }
}),

// Pushes a term onto the operator stack
oppush:(function(op,opstack,pstack) {
  var proc=true;
  var p=cparser.precedence(op);
  var prevop;
  while (opstack.length>0 && proc) {
    prevop=opstack.pop();
    if (cparser.precedence(prevop)>=p) {
      pstack.push(prevop);
    } else {
      opstack.push(prevop);
      proc=false;
    }
  }
  opstack.push(op);
}),

// Parses a string into an RPN stack (reversed)
parsestr:(function(formula,variables) {
  formula=formula.toLowerCase();
  if (variables===undefined) {
    variables=["z"];
  }
  // Regular expression strings
  var num="\\d+(\\.\\d*)?|\\.\\d+";
  var vname=variables[0];
  for (var i=1;i<variables.length;i++) {
    vname=vname+"|"+variables[i];
  }
  var op="\\+|\\-|\\*|\\/|\\^";
  var sp="\\s+";
  var paren="\\(|\\)";
  var fctarray=["sinh","cosh","tanh","conj","sin","cos","tan",
                "abs","mod","exp","log","ln","sqrt"];
  var fct="";
  var con="e|pi|i|j";
  // Create reg exp string for function
  for (var i=0; i<fctarray.length; i++) {
    if (i>0) { fct=fct+"|"; }
    fct=fct+fctarray[i]; 
  }
  var re=num+"|"+vname+"|"+op+"|"+paren+"|"+fct+"|"+con+"|"+sp;

  // Create regular expressions
  term = new RegExp(re); 
  conre=new RegExp("^("+con+")$");
  fctre=new RegExp("^("+fct+")$");
  opre =new RegExp("^("+op+"$)");
  numre=new RegExp("^("+num+"$)");
  varre=new RegExp("^("+vname+"$)");

  // Variables for main cparser loop
  var prev="first";
  var opstack=[];
  var parsed=[];
//  var error="";
  var a,op,pt,proc;

  parsed.error=false;

  // Loop through terms identified by regular expressions
  while ((a=term.exec(formula)) && !parsed.error) { 
    formula=formula.substr(a[0].length);
    if (numre.test(a[0]) || conre.test(a[0]) || varre.test(a[0])) { // Value
      switch (prev) {
        case "value":
        case "rparen":
          // push * on opstack
          cparser.oppush("*",opstack,parsed);
          parsed.push(a[0]);
          break;
        case "op":
        case "lparen":
        case "first":
          parsed.push(a[0]);
          break;
        case "fct":
          parsed.error="Parse error: function "+pt+" must be followed by ( not "+a[0];
          break;
      }
      pt=a[0];
      prev="value";
    }
    if (opre.test(a[0])) { // Operator
      switch(prev) {
        case "value":
        case "rparen":
          cparser.oppush(a[0],opstack,parsed);
          break;
        case "op":
        case "lparen":
        case "first":
          if (a[0]=="-") {  // Unary minus from context
            cparser.oppush("chs",opstack,parsed);
            break;
          } else {
            if (first) {
              parsed.error="Parse error: expression can't start with "+a[0];
            } else {
              parsed.error="Parse error: "+pt+" can't be followed by "+a[0];
            }
          }
          break;
        case "fct":
          parsed.error="Parse error: function "+pt+" must be followed by ( not "+a[0];
          break;
      }
      prev="op";
      pt=a[0];
    }
    if (fctre.test(a[0])) { // Function
      switch (prev) {
        case "value":
        case "rparen": 
          cparser.oppush("*",opstack,parsed);
          // no break, falling through deliberately
        case "op":
        case "lparen":
        case "first":
          // Push directly without precedence
          opstack.push("(");
          opstack.push(a[0]); 
          break;
        case "fct":
          parsed.error="Parse error: function "+pt+" must be followed by ( not "+a[0];
          break;
      }
      prev="fct";
      pt=a[0];
    }
    if (a[0]=="(") { // Left Paren
      switch (prev) {
        case "fct":
          // assumed when fct seen
          break;
        case "value":
        case "rparen":
          cparser.oppush("*",opstack,parsed);
          // no break, falling through deliberately
        case "lparen":
        case "op":
        case "first":
          opstack.push("(");
          break;
      }
      prev="lparen";
      pt=pt+"("; 
    }
    if (a[0]==")") { // Right Paren 
      switch (prev) {
        case "rparen":
        case "value":
          // pop opstack to previous (
          proc=true;
          while (opstack.length>0 && proc) {
            op=opstack.pop();
            if (op=="(") { 
              proc=false;
            } else {
              parsed.push(op);
            }
          }  
          if (proc) { parsed.error="Parse error: mismatched parentheses";}
          break;
        case "op":
        case "lparen":
          parsed.error="Parse error: "+pt+" can't be immediately followed by )";
          break;
        case "fct":
          parsed.error="Parse error: function "+pt+" must be followed by ( not )";
          break;
        case "first":
          parsed.error="Parse error: expression can't start with )";
          break;
      }
      prev="rparen";
      pt=pt+")"; 
    }
    if (a.index>0) { parsed.error="Parse error: Illegal term "+a[0]; }
  } 

  // Clean up Operator stack
  if (!parsed.error) {
    while (opstack.length>0) {
      op=opstack.pop();
      if (op=="(") { 
        parsed.error="Parse error: mismatched parentheses";
      } else {
        parsed.push(op);
      }
    }
  }

  // Check return value
  if (parsed.error) {
    return parsed.error;   
  } else if (formula) { // part of formula left over
    return "Parse error: unable to parse "+formula; 
  } else { // test you can actually compute
    var testval=[];
    for (var i=0;i<variables.length;i++) {testval[i]=[1,0];}
    var retval=cparser.evalfct(parsed,testval,variables);
    if ((typeof retval)==="string") { 
      return retval.replace("Computation","Parse");
    } else {
      return parsed; // success
    }
  }

}),

// Evaluates an RPN stack
evalfct:(function(parsed,x,variables) {
  if (variables===undefined) {
    variables=["z"];
  }
  // Regular Expression definitions (note fct has one more option for unary minus)
  var num="\\d+(\\.\\d*)?|\\.\\d+";
  var vname=variables[0];
  for (var i=1;i<variables.length;i++) {
    vname=vname+"|"+variables[i];
  }
  var op="\\+|\\-|\\*|\\/|\\^";
  var sp="\\s+";
  var paren="\\(|\\)";
  var fctarray=["sinh","cosh","tanh","conj","sin","cos","tan",
                "abs","mod","exp","log","ln","sqrt","chs"];
  var fct="";
  var con="e|pi|i|j";
  // Create reg exp string for function
  for (var i=0; i<fctarray.length; i++) {
    if (i>0) { fct=fct+"|"; }
    fct=fct+fctarray[i]; 
  }
  var re=num+"|"+vname+"|"+op+"|"+paren+"|"+fct+"|"+con+"|"+sp;

  // Create regular expressions
  term = new RegExp(re); 
  conre=new RegExp("^("+con+")$");
  fctre=new RegExp("^("+fct+")$");
  opre =new RegExp("^("+op+"$)");
  numre=new RegExp("^("+num+"$)");
  varre=new RegExp("^("+vname+"$)");

  var error="";
  var valstack=[];
  var term,aterm,bterm;

  // Define some helper functions
  var cosh=(function(x) {return (Math.exp(x)+Math.exp(-x))/2; });
  var sinh=(function(x) {return (Math.exp(x)-Math.exp(-x))/2; });
  var cdiv=(function(x,y) {  //  computes y/x
              var denom=x[0]*x[0]+x[1]*x[1];
              return [(y[0]*x[0]+y[1]*x[1])/denom,(x[0]*y[1]-x[1]*y[0])/denom];
            });

  // Loop to process RPN stack
  for (var i=0;i<parsed.length;i++) {
    term=parsed[i];
    if (!error) {
      if (numre.test(term)) { // Decimal Number
        aterm=new Number(term);
        valstack.push([aterm.valueOf(),0]);
      } else if (conre.test(term)) { // Constant
        if (term=="e") {
          valstack.push([Math.E,0]);
        }
        if (term=="pi") {
          valstack.push([Math.PI,0]);
        }
        if (term=="i" || term=="j") {
          valstack.push([0,1]);
        }
      } else if (varre.test(term)) { // Variable
        valstack.push(x[variables.indexOf(term)]);
      } else if (opre.test(term)) { // Binary Operator
        if (valstack.length>=2) {
          aterm=valstack.pop();
          bterm=valstack.pop();
          switch (term) {
            case "^": 
              var babs=Math.sqrt(bterm[0]*bterm[0]+bterm[1]*bterm[1]);
              if (babs>0) {
                var btheta=Math.atan2(bterm[1],bterm[0]);
                var at0=aterm[0]*btheta;
                var at1=aterm[1]*btheta;
                var lnra1=aterm[1]*Math.log(babs);
                var powabs=Math.pow(babs,aterm[0])*Math.exp(-at1);
                var powre=Math.cos(at0)*Math.cos(lnra1)
                                 -Math.sin(at0)*Math.sin(lnra1);
                var powim=Math.cos(at0)*Math.sin(lnra1)
                                 +Math.sin(at0)*Math.cos(lnra1);
                valstack.push([powabs*powre,powabs*powim]);
              } else { // avoid 0^z returning NaN because of log term
                valstack.push([0,0]);
              }
              break;
            case "*":
              valstack.push([aterm[0]*bterm[0]-aterm[1]*bterm[1],
                             aterm[1]*bterm[0]+aterm[0]*bterm[1]]);
              break;
            case "/":
              valstack.push(cdiv(aterm,bterm));
              break;
            case "+":
              valstack.push([aterm[0]+bterm[0],aterm[1]+bterm[1]]);
              break;
            case "-":
              valstack.push([bterm[0]-aterm[0],bterm[1]-aterm[1]]);
              break;
          }
        } else {
          error = "Computation error: missing value in computing "+term;
        }
      } else if (fctre.test(term)) { // Unary Function
        if (valstack.length>0) {
          aterm=valstack.pop();
          switch (term) {
            case "sin":
              valstack.push([cosh(aterm[1])*Math.sin(aterm[0]),
                             sinh(aterm[1])*Math.cos(aterm[0])]);
              break;
            case "cos":
              valstack.push([cosh(aterm[1])*Math.cos(aterm[0]),
                             -sinh(aterm[1])*Math.sin(aterm[0])]);
              break;
            case "tan":
              var top=[cosh(aterm[1])*Math.sin(aterm[0]),
                       sinh(aterm[1])*Math.cos(aterm[0])];
              var bot=[cosh(aterm[1])*Math.cos(aterm[0]),
                       -sinh(aterm[1])*Math.sin(aterm[0])];
              valstack.push(cdiv(bot,top));
              break;
/*
            case "asin":
              valstack.push(Math.acos(aterm));
              break;
            case "acos":
              valstack.push(Math.acos(aterm));
              break;
            case "atan":
              valstack.push(Math.atan(aterm));
              break;
*/
            case "sinh":
              valstack.push([sinh(aterm[0])*Math.cos(aterm[1]),
                             cosh(aterm[0])*Math.sin(aterm[1])]);
              break;
            case "cosh":
              valstack.push([cosh(aterm[0])*Math.cos(aterm[1]),
                             sinh(aterm[0])*Math.sin(aterm[1])]);
              break;
            case "tanh":
              var top=[sinh(aterm[0])*Math.cos(aterm[1]),
                       cosh(aterm[0])*Math.sin(aterm[1])];
              var bot=[cosh(aterm[0])*Math.cos(aterm[1]),
                       sinh(aterm[0])*Math.sin(aterm[1])];
              valstack.push(cdiv(bot,top));
              break;
            case "log":
            case "ln":
              var zmod=Math.sqrt(aterm[0]*aterm[0]+aterm[1]*aterm[1]);
              var ztheta=Math.atan2(aterm[1],aterm[0]);
              valstack.push([Math.log(zmod),ztheta]);
              break;
            case "exp":
              valstack.push([Math.exp(aterm[0])*Math.cos(aterm[1]),
                             Math.exp(aterm[0])*Math.sin(aterm[1])]);
              break;
            case "sqrt":
              var zmod=Math.sqrt(aterm[0]*aterm[0]+aterm[1]*aterm[1]);
              var ztheta=Math.atan2(aterm[1],aterm[0])
              valstack.push([Math.sqrt(zmod)*Math.cos(ztheta/2),
                             Math.sqrt(zmod)*Math.sin(ztheta/2)]);
              break;
            case "chs":
              valstack.push([-aterm[0],-aterm[1]]);
              break;
            case "abs":
            case "mod":
              valstack.push([Math.sqrt(aterm[0]*aterm[0]+aterm[1]*aterm[1]),
                             0]);
              break;
            case "conj":
              valstack.push([aterm[0],-aterm[1]]);
              break;
          }
        } else {
          error="Computation error: missing value in computing "+term;
        }
      } else {
        error="Computation Error: "+term+" undefined";
      }
    }
  }

  if (error) { return error; }  
  if (valstack.length==1) {
    return valstack.pop();
  } else {
    return "Computation Error: improper termination with "+valstack.length+" terms left";
  }
}),

makefct:(function(formula,variables) {
  var varnames=variables;
  if (varnames===undefined) {
    varnames=["z"];
  }
  var pps=cparser.parsestr(formula,varnames);
  if ((typeof pps)==="string") {
    return pps;
  } else {
    return function(x) {return cparser.evalfct(pps,x,varnames);}
  }
})

};
