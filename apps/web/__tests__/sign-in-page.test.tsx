import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, mock } from "bun:test";
import type { ComponentProps } from "react";
import { SignInClient } from "../app/sign-in/[[...sign-in]]/sign-in-client";

mock.module("@clerk/nextjs", () => ({
  SignIn: (_props: ComponentProps<"div">) => <div data-testid="sign-in-component" />,
}));

describe("SignInClient", () => {
  it("renders sign in interface with routing props", () => {
    render(<SignInClient redirectUrl="/events/sample" />);
    expect(screen.getByTestId("sign-in-component")).toBeTruthy();
  });
});
