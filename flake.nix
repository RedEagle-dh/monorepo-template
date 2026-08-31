{
  description = "Bun + Turborepo full-stack template dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # runtime / package manager — turbo, biome, typescript, drizzle-kit
            # all run through bun and are versioned in package.json
            bun

            # postgresql client tools (psql, pg_dump, pg_isready)
            postgresql

            # redis-cli for poking the cache
            redis
          ];

          shellHook = ''
            echo "bun $(bun --version) · $(psql --version | head -1) · redis-cli $(redis-cli --version | cut -d' ' -f2)"
          '';
        };
      });
}
