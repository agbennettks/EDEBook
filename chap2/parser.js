var parser={

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
  var p=parser.precedence(op);
  var prevop;
  while (opstack.length>0 && proc) {
    prevop=opstack.pop();
    if (parser.precedence(prevop)>=p) {
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
    variables=["x","y"];
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
  var fctarray=["sin","cos","tan","asin","acos","atan",
                "sinh","cosh","tanh","abs","exp","log","ln","sqrt"];
  var fct="";
  var con="e|pi";
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

  // Variables for main parser loop
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
          parser.oppush("*",opstack,parsed);
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
          parser.oppush(a[0],opstack,parsed);
          break;
        case "op":
        case "lparen":
        case "first":
          if (a[0]=="-") {  // Unary minus from context
            parser.oppush("chs",opstack,parsed);
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
          parser.oppush("*",opstack,parsed);
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
          parser.oppush("*",opstack,parsed);
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
    for (var i=0;i<variables.length;i++) {testval[i]=1;}
    var retval=parser.evalfct(parsed,testval,variables);
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
    variables=["x","y"];
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
  var fctarray=["sin","cos","tan","asin","acos","atan",
                "sinh","cosh","tanh","abs","exp","log","ln","sqrt","chs"];
  var fct="";
  var con="e|pi";
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

  // Loop to process RPN stack
  for (var i=0;i<parsed.length;i++) {
    term=parsed[i];
    if (!error) {
      if (numre.test(term)) { // Decimal Number
        aterm=new Number(term);
        valstack.push(aterm.valueOf());
      } else if (conre.test(term)) { // Constant
        if (term=="e") {
          valstack.push(Math.E);
        }
        if (term=="pi") {
          valstack.push(Math.PI);
        }
      } else if (varre.test(term)) { // Variable
        valstack.push(x[variables.indexOf(term)]);
/*
        if (term=="x") {
          valstack.push(x);
        }
        if (term=="y") {
          valstack.push(y);
        }
*/
      } else if (opre.test(term)) { // Binary Operator
        if (valstack.length>=2) {
          aterm=valstack.pop();
          bterm=valstack.pop();
          switch (term) {
            case "^": 
              valstack.push(Math.pow(bterm,aterm));
              break;
            case "*":
              valstack.push(aterm*bterm);
              break;
            case "/":
              valstack.push(bterm/aterm);
              break;
            case "+":
              valstack.push(aterm+bterm);
              break;
            case "-":
              valstack.push(bterm-aterm);
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
              valstack.push(Math.sin(aterm));
              break;
            case "cos":
              valstack.push(Math.cos(aterm));
              break;
            case "tan":
              valstack.push(Math.tan(aterm));
              break;
            case "asin":
              valstack.push(Math.asin(aterm));
              break;
            case "acos":
              valstack.push(Math.acos(aterm));
              break;
            case "atan":
              valstack.push(Math.atan(aterm));
              break;
            case "sinh":
              valstack.push((Math.exp(aterm)-Math.exp(-aterm))/2);
              break;
            case "cosh":
              valstack.push((Math.exp(aterm)+Math.exp(-aterm))/2);
              break;
            case "tanh":
valstack.push((Math.exp(aterm)-Math.exp(-aterm))/(Math.exp(aterm)+Math.exp(-aterm)));
              break;
            case "log":
            case "ln":
              valstack.push(Math.log(aterm));
              break;
            case "exp":
              valstack.push(Math.exp(aterm));
              break;
            case "sqrt":
              valstack.push(Math.sqrt(aterm));
              break;
            case "chs":
              valstack.push(-aterm);
              break;
            case "abs":
              valstack.push(Math.abs(aterm));
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
    varnames=["x","y"];
  }
  var pps=parser.parsestr(formula,varnames);
  if ((typeof pps)==="string") {
    return pps;
  } else {
    return function(x) {return parser.evalfct(pps,x,varnames);}
  }
}),

// Use RKF2(3) to produce a list of points on an integral curve in
// 2 dimensions. 
rkf23crv:(function(f,init,tfinal,tol,maxcyc,minpts) {
  // solves y' = f(x,y), y(x0)=y0
  // for function f
  // initial values x0=init[0], y0=init[1]
  // to first point *past* tfinal (i.e. will run over tfinal)
  // with local tolerance tol
  // Note: the path may terminate early if step-size shrinks too far.
  // This typically means tfinal is outside the domain of the solution,
  // say because of a vertical asymptote.

  if (tol===undefined) tol=0.001;
  if (maxcyc===undefined) maxcyc=500;
  if (minpts===undefined) minpts=20;
  var h,hold,hmax;
  var f0,f1,f2;
  var x0,x1,x2;
  var y1,y2;
  var chicken=0.9;
  var truncerr,counter,numcyc;  
  var dataX=[];
  var dataY=[];

  h=(tfinal-init[0])/50;
  hmax=h*2.5;
  x0=init;
  dataX.push(x0[0]);
  dataY.push(x0[1]);
  x1=[];
  x2=[];
  counter=0;
  numcyc=0;

  while (x0[0]<tfinal && counter<6 && numcyc<maxcyc) {
    counter++;
    numcyc++;
    f0=f(x0);
    x1[0]=x0[0]+h;
    x1[1]=x0[1]+h*f0;
    f1=f(x1);
    y1=x0[1]+h*(f0+f1)/2;
    x2[0]=x0[0]+h/2;
    x2[1]=x0[1]+h*(f0+f1)/4;
    f2=f(x2);
    y2=x0[1]+h*(f0+f1+4*f2)/6;
    truncerr=Math.abs(y2-y1);
    if (truncerr<tol*(Math.abs(y2)+1)) {
      x0[0]=x1[0];
      x0[1]=y2;
      dataX.push(x0[0]);
      dataY.push(x0[1]);
      counter=0;
    }
    if (truncerr>(tol/8)) {
      h=chicken*h*Math.pow(tol/truncerr,1/3);
    } else {
      h=2*chicken*h;
    }
    if (h>hmax) h=hmax;
  }  
  return [dataX,dataY];
})

};
