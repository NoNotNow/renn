var s=Object.defineProperty;var u=(r,e,t)=>e in r?s(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var o=(r,e,t)=>u(r,typeof e!="symbol"?e+"":e,t);import{i as BaseTransformer}from"./index-BzbkYMEM.js";class CustomTransformer extends BaseTransformer{constructor(e=10,t){super(e,!0);o(this,"type","custom");o(this,"code");this.code=t}setCode(e){this.code=e}transform(input,dt){try{const context={input,dt,getAction:e=>input.actions[e]??0,Math,PI:Math.PI},wrappedCode=`
        (function() {
          ${this.code}
        })()
      `,result=eval(wrappedCode);return result&&typeof result=="object"?{force:result.force,impulse:result.impulse,torque:result.torque,earlyExit:result.earlyExit??!1}:{force:void 0,impulse:void 0,torque:void 0,earlyExit:!1}}catch(e){return console.error("[CustomTransformer] Error executing code:",e),{force:void 0,impulse:void 0,torque:void 0,earlyExit:!1}}}}export{CustomTransformer};
