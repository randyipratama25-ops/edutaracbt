import type { ReactNode } from "react";
export function HelpDisclosure({children,title="Panduan"}:{children:ReactNode;title?:string}){
 return <details className="help-disclosure"><summary>{title}</summary><div className="help-disclosure-content">{children}</div></details>;
}
