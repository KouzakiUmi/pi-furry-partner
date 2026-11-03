{
  description = "Development environments for pi-furry-partner";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

  outputs = { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_24;
          mkSitePackage = { pname, version, projectDir }:
            pkgs.stdenvNoCC.mkDerivation {
              inherit pname version;
              src = self;
              nativeBuildInputs = [ node ];
              dontConfigure = true;

              buildPhase = ''
                runHook preBuild
                sourceDir="$NIX_BUILD_TOP/$sourceRoot"
                cd "$sourceDir/${projectDir}"
                npm run build:site
                npm run test:site
                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall
                mkdir -p "$out"
                sourceDir="$NIX_BUILD_TOP/$sourceRoot"
                cp -R "$sourceDir/${projectDir}/dist/." "$out/"
                runHook postInstall
              '';
            };
        in
        {
          site-original = mkSitePackage {
            pname = "pi-furry-partner-site-original";
            version = "2.5.1";
            projectDir = ".";
          };

          site-hd = mkSitePackage {
            pname = "pi-furry-partner-site-hd";
            version = "2.5.1-preview.6";
            projectDir = "editions/hd";
          };
        });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_24;
          pythonWithValidation = pkgs.python3.withPackages (pythonPackages: [
            pythonPackages.numpy
            pythonPackages.pillow
          ]);

        in
        {
          # Root original-resource development. Pi's real runtime remains an
          # explicit local/CI test input rather than an unpinned npm install.
          default = pkgs.mkShell {
            packages = [
              node
              pkgs.python3
              pkgs.coreutils
              pkgs.gh
              pkgs.git
              pkgs.unzip
            ];

            shellHook = ''
              echo "pi-furry-partner original-resource development shell"
              echo "Suggested checks: npm test; npm run build:site; npm run test:site"
              echo "Pi runtime tests additionally require PI_TEST_MODULES."
            '';
          };

          # HD package and validation work. This deliberately does not include
          # generation-only media tooling; use the media shell for that.
          hd = pkgs.mkShell {
            packages = [
              node
              pythonWithValidation
              pkgs.git
              pkgs.gnutar
              pkgs.gzip
              pkgs.unzip
            ];

            shellHook = ''
              echo "pi-furry-partner HD development and validation shell"
              echo "Run from editions/hd: npm test; npm run build:site; npm run test:site"
              echo "Pi runtime tests additionally require PI_TEST_MODULES."
            '';
          };

          media = pkgs.mkShell {
            packages = [
              node
              pythonWithValidation
              pkgs.ffmpeg
              pkgs.libwebp
              pkgs.git
            ];

            shellHook = ''
              echo "pi-furry-partner offline media-production shell"
              echo "Read editions/hd/docs/production/AGENTS.md before changing assets."
            '';
          };
        });

      formatter = forAllSystems (system:
        (import nixpkgs { inherit system; }).nixfmt-rfc-style);
    };
}
