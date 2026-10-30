{
  description = "Development environments for pi-furry-partner";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";

  outputs =
    { self, nixpkgs }:
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
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_24;
          sourceRoot = toString self;
          relativeSourcePath =
            path:
            let
              value = toString path;
            in
            if value == sourceRoot then
              ""
            else
              builtins.substring ((builtins.stringLength sourceRoot) + 1) (
                (builtins.stringLength value) - (builtins.stringLength sourceRoot) - 1
              ) value;
          sourceFilter =
            predicate:
            pkgs.lib.cleanSourceWith {
              src = self;
              filter = path: type: predicate (relativeSourcePath path) type;
            };
          sourceFor =
            prefixes:
            sourceFilter (
              relative: _:
              relative == ""
              || builtins.any (
                prefix:
                relative == prefix
                || pkgs.lib.hasPrefix "${prefix}/" relative
                || pkgs.lib.hasPrefix "${relative}/" prefix
              ) prefixes
            );
          originalExtensionSource = sourceFor [
            "index.ts"
            "config.json"
            "install.ps1"
            "uninstall.ps1"
            "package.json"
            "lib"
            "assets"
            "themes"
            "prompts"
            "LICENSE"
            "NOTICE"
            "ASSET_LICENSE.md"
            "README.md"
            "README.en.md"
          ];
          originalArchiveSource = sourceFilter (
            relative: _:
            let
              top = if relative == "" then "" else builtins.head (pkgs.lib.splitString "/" relative);
            in
            relative == ""
            || !(builtins.elem top [
              "editions"
              ".github"
              ".git"
            ])
          );
          hdSource = sourceFor [ "editions/hd" ];
          mkSitePackage =
            {
              pname,
              versionFile,
              projectDir,
              src,
            }:
            let
              # Keep the package version aligned with the edition's own manifest.
              version = (builtins.fromJSON (builtins.readFile versionFile)).version;
            in
            pkgs.stdenvNoCC.mkDerivation {
              inherit pname version src;
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
          pi-original-extension =
            let
              extensionVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
            in
            pkgs.stdenvNoCC.mkDerivation {
              pname = "pi-furry-partner-original";
              version = extensionVersion;
              src = originalExtensionSource;
              nativeBuildInputs = [
                node
                pkgs.gnutar
              ];
              dontConfigure = true;

              buildPhase = ''
                runHook preBuild
                export HOME="$NIX_BUILD_TOP/home"
                export npm_config_cache="$NIX_BUILD_TOP/npm-cache"
                mkdir -p "$HOME" "$npm_config_cache"
                sourceDir="$NIX_BUILD_TOP/$sourceRoot"
                cd "$sourceDir"
                npm pack --ignore-scripts --pack-destination "$NIX_BUILD_TOP"
                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall
                mkdir -p "$out"
                tar -xzf "$NIX_BUILD_TOP/pi-furry-partner-${extensionVersion}.tgz" \
                  --strip-components=1 --directory "$out"
                runHook postInstall
              '';
            };

          pi-original-zip =
            let
              releaseVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
            in
            pkgs.stdenvNoCC.mkDerivation {
              pname = "pi-furry-partner-release-zip";
              version = releaseVersion;
              src = originalArchiveSource;
              nativeBuildInputs = [
                pkgs.coreutils
                pkgs.python3
              ];
              dontConfigure = true;

              buildPhase = ''
                runHook preBuild
                sourceDir="$NIX_BUILD_TOP/$sourceRoot"
                archive="$NIX_BUILD_TOP/pi-furry-partner-${releaseVersion}.zip"
                python "$sourceDir/scripts/package-pi-release.py" \
                  --source "$sourceDir" --out "$archive"
                (cd "$NIX_BUILD_TOP" && sha256sum "pi-furry-partner-${releaseVersion}.zip" \
                  > "pi-furry-partner-${releaseVersion}.zip.sha256")
                runHook postBuild
              '';

              installPhase = ''
                runHook preInstall
                mkdir -p "$out"
                cp "$NIX_BUILD_TOP/pi-furry-partner-${releaseVersion}.zip" "$out/"
                cp "$NIX_BUILD_TOP/pi-furry-partner-${releaseVersion}.zip.sha256" "$out/"
                runHook postInstall
              '';
            };

          site-original = mkSitePackage {
            pname = "pi-furry-partner-site-original";
            versionFile = ./package.json;
            projectDir = ".";
            src = sourceFor [
              "index.ts"
              "config.json"
              "package.json"
              "lib"
              "assets"
              "scripts"
              "site"
              "themes"
              "README.md"
              "README.en.md"
            ];
          };

          site-hd = mkSitePackage {
            pname = "pi-furry-partner-site-hd";
            versionFile = ./editions/hd/package.json;
            projectDir = "editions/hd";
            src = hdSource;
          };
        }
      );

      devShells = forAllSystems (
        system:
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
        }
      );

      formatter = forAllSystems (system: (import nixpkgs { inherit system; }).nixfmt-rfc-style);
    };
}
