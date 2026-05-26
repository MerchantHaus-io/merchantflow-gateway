// Walks TERMS_AND_CONDITIONS and renders the JSX surface for the website's
// /terms-processing page. The same data is used by the PDF renderer in
// src/lib/quotePdf.ts → renderFullTermsAndConditions.

import { TERMS_AND_CONDITIONS, type TermsBlock } from "./termsAndConditions";

export function TermsContent() {
  return (
    <div className="prose prose-sm max-w-none text-foreground space-y-4 text-sm leading-relaxed">
      {TERMS_AND_CONDITIONS.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

function renderBlock(block: TermsBlock, key: number) {
  switch (block.type) {
    case "heading": {
      const common = "mt-6 font-semibold";
      switch (block.level) {
        case 1:
          return (
            <h2 key={key} className="text-lg font-bold mt-12 mb-4">
              {block.text}
            </h2>
          );
        case 2:
          return (
            <h2 key={key} className="text-lg font-bold mt-8 mb-4">
              {block.text}
            </h2>
          );
        case 3:
          return (
            <h3 key={key} className={common + " mt-6"}>
              {block.text}
            </h3>
          );
        case 4:
          return (
            <h4 key={key} className={common + " mt-4"}>
              {block.text}
            </h4>
          );
      }
      break;
    }
    case "paragraph":
      return (
        <p
          key={key}
          className={
            (block.allCaps ? "uppercase " : "") + (block.indent ? "ml-4 " : "")
          }
        >
          {block.text}
        </p>
      );
    case "definition":
      return (
        <p key={key}>
          <strong>"{block.term}"</strong> {block.body}
        </p>
      );
    case "list":
      if (block.style === "decimal") {
        return (
          <ol key={key} className="list-decimal pl-6 space-y-2">
            {block.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={key} className="list-disc pl-6 space-y-1">
          {block.items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      );
  }
}
