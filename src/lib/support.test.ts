import { describe, expect, it } from "vitest";
import { messagePreview, splitQuotedText } from "./support";

describe("splitQuotedText", () => {
  it("separates an 'On … wrote:' chain from the new text", () => {
    const body = "Thanks, that worked.\n\nOn Tue, Nov 4, 2026 at 9:00 AM Support <support@x.io> wrote:\n> Try again\n> please";
    expect(splitQuotedText(body)).toEqual({
      main: "Thanks, that worked.",
      quoted: "On Tue, Nov 4, 2026 at 9:00 AM Support <support@x.io> wrote:\n> Try again\n> please",
    });
  });

  it("separates an Original Message block and a forwarded From: header", () => {
    expect(splitQuotedText("Hi\n-----Original Message-----\nold").main).toBe("Hi");
    expect(splitQuotedText("See below\nFrom: Jo <jo@x.io>\nold").quoted).toBe("From: Jo <jo@x.io>\nold");
  });

  it("treats only a trailing run of > lines as quoted", () => {
    expect(splitQuotedText("New\n> old\n> older").main).toBe("New");
    expect(splitQuotedText("> quoting you\nmy answer").quoted).toBe("");
  });

  it("keeps the whole message when everything would be quoted, or nothing is", () => {
    expect(splitQuotedText("On Mon X wrote:\n> only quote")).toEqual({
      main: "On Mon X wrote:\n> only quote",
      quoted: "",
    });
    expect(splitQuotedText("plain message")).toEqual({ main: "plain message", quoted: "" });
  });
});

describe("messagePreview", () => {
  it("flattens whitespace, drops quoted text and truncates", () => {
    expect(messagePreview("Hello\n\n there\nOn A wrote:\n> x")).toBe("Hello there");
    expect(messagePreview("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
  });
});
