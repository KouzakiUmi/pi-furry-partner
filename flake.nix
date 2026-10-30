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
      # One filtered input per consumer. Both the packages and the checks need
      # these trees, so they live outside forAllSystems: a source path does not
      # depend on the target system.
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
        nixpkgs.lib.cleanSourceWith {
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
            || nixpkgs.lib.hasPrefix "${prefix}/" relative
            || nixpkgs.lib.hasPrefix "${relative}/" prefix
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
          top = if relative == "" then "" else builtins.head (nixpkgs.lib.splitString "/" relative);
        in
        relative == ""
        || !(builtins.elem top [
          "editions"
          ".github"
          ".git"
        ])
      );
      hdSource = sourceFor [ "editions/hd" ];
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_24;
          pythonWithValidation = pkgs.python3.withPackages (pythonPackages: [
            pythonPackages.numpy
            pythonPackages.pillow
          ]);
          # Bind these to the HD tree, not to the whole flake source. Deriving
          # them from `self` made any unrelated edit rehash the Pi test runtimes,
          # which in turn invalidated the HD derivation and re-ran its full test
          # suite locally, while a clean CI checkout never saw the churn.
          testRuntimeSource =
            runtimeName:
            builtins.path {
              path = hdSource + "/editions/hd/test-runtimes/${runtimeName}";
              name = "pi-test-runtime-${runtimeName}";
            };
          mkPiTestRuntime =
            {
              runtimeName,
              version,
              npmDepsHash,
            }:
            pkgs.buildNpmPackage {
              pname = "pi-furry-partner-pi-test-runtime";
              inherit version npmDepsHash;
              src = testRuntimeSource runtimeName;
              dontNpmBuild = true;
              npmRebuildFlags = [ "--ignore-scripts" ];
              installPhase = ''
                mkdir -p "$out"
                cp -R node_modules "$out/node_modules"
              '';
            };
          piTestRuntime12 = mkPiTestRuntime {
            runtimeName = "pi-1.2";
            version = "1.2.0";
            npmDepsHash = "sha256-7cN1q36ijhAxwiUcQzb7+WPWKJU3Al6tpkPV6pz6pI4=";
          };
          piTestRuntime13 = mkPiTestRuntime {
            runtimeName = "pi-1.3";
            version = "1.3.0";
            npmDepsHash = "sha256-BSJT7Vj4ag8EJ+qnV49pM+SOV3iIeTjyXk/ykTcPDE0=";
          };
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
          # Both public HD outputs share one verified build. Its default output
          # is the unpacked Pi package tree; `bundle` is the release archive
          # and reports. Do not split this into two derivations: either output
          # must run the same dual-runtime suite, audit and package smoke test.
          piHdBuild = pkgs.stdenvNoCC.mkDerivation {
            pname = "pi-furry-partner-hd";
            version = "2.5.1-preview.6";
            outputs = [
              "out"
              "bundle"
            ];
            src = hdSource;
            nativeBuildInputs = [
              node
              pythonWithValidation
              piTestRuntime12
              piTestRuntime13
            ];
            dontConfigure = true;

            buildPhase = ''
              runHook preBuild
              export HOME="$NIX_BUILD_TOP/home"
              mkdir -p "$HOME"
              sourceDir="$NIX_BUILD_TOP/$sourceRoot/editions/hd"
              rm -rf "$sourceDir/dist"
              cd "$sourceDir"
              python tools/build-editions.py --edition full-animation --platform pi --test \
                --test-modules "${piTestRuntime12}/node_modules" \
                --test-modules "${piTestRuntime13}/node_modules"
              python tools/audit-edition-bundles.py
              python tools/write-edition-release.py
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out" "$bundle"
              cp -R "$NIX_BUILD_TOP/$sourceRoot/editions/hd/dist/releases/." "$bundle/"
              python "$NIX_BUILD_TOP/$sourceRoot/editions/hd/tools/rebase-release-report-paths.py" \
                --directory "$bundle"
              cp -R "$NIX_BUILD_TOP/$sourceRoot/editions/hd/dist/verified/full-animation-pi/package/." \
                "$out/"
              test -f "$out/package.json"
              test -f "$out/index.ts"
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

          pi-test-runtime-1_2 = piTestRuntime12;
          pi-test-runtime-1_3 = piTestRuntime13;

          pi-hd-bundle = piHdBuild.bundle;
          pi-hd-extension = piHdBuild;

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

      # `nix flake check` used to pass without running anything, because the
      # flake exported no checks at all. Reuse the package derivations where the
      # build already is the verification: the site packages run their own site
      # checks, and pi-hd-bundle runs the whole HD suite against both Pi runtimes
      # before it can produce an archive. Windows-only PowerShell, installer and
      # recovery coverage stays on the Windows runners; a Linux sandbox cannot
      # stand in for it.
      checks = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          node = pkgs.nodejs_24;
          packages = self.packages.${system};
          mkVerifiedCheck =
            {
              pname,
              version,
              src,
              nativeBuildInputs,
              run,
            }:
            pkgs.stdenvNoCC.mkDerivation {
              inherit
                pname
                version
                src
                nativeBuildInputs
                ;
              dontConfigure = true;
              dontBuild = true;

              installPhase = ''
                runHook preInstall
                cd "$NIX_BUILD_TOP/$sourceRoot"
                ${run}
                mkdir -p "$out"
                touch "$out/passed"
                runHook postInstall
              '';
            };
        in
        {
          inherit (packages)
            pi-original-extension
            pi-original-zip
            site-original
            site-hd
            pi-hd-bundle
            pi-hd-extension
            ;

          # The original-resource line checks that the packages above cannot
          # express: the published version, the changelog-derived release plan
          # and the preserved v2.4.0 resource hashes.
          original-line = mkVerifiedCheck {
            pname = "pi-furry-partner-check-original-line";
            version = "2.5.1";
            src = originalArchiveSource;
            nativeBuildInputs = [ node ];
            run = ''
              node scripts/verify-legacy-line.mjs
              node tests/legacy-release.mjs
              node tests/legacy-resources.mjs
            '';
          };

          # HD release-line isolation, checked from editions/hd because that
          # is where tools/release-edition.py and its fixtures live.
          hd-release-lines = mkVerifiedCheck {
            pname = "pi-furry-partner-check-hd-release-lines";
            version = "2.5.1-preview.6";
            src = hdSource;
            nativeBuildInputs = [ pkgs.python3 ];
            run = ''
              cd editions/hd
              python tests/release-lines.py
            '';
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

          # The project tests consume a node_modules directory, not the Pi
          # launcher. Use the same fixed dependency closures as the HD package
          # build so entering a shell neither needs npm nor writes to work/.
          mkPiShell =
            { version, testRuntime }:
            pkgs.mkShell {
              packages = [
                node
                pkgs.git
                testRuntime
              ];

              shellHook = ''
                export PI_TEST_MODULES="${testRuntime}/node_modules"
                runtime_package="$PI_TEST_MODULES/@earendil-works/pi-coding-agent/package.json"
                tui_package="$PI_TEST_MODULES/@earendil-works/pi-tui/package.json"
                test "$(node -p 'require(process.argv[1]).version' "$runtime_package")" = "${version}"
                test "$(node -p 'require(process.argv[1]).version' "$tui_package")" = "${version}"
                echo "PI_TEST_MODULES=$PI_TEST_MODULES"
                echo "Fixed Pi ${version} runtime is ready for: npm test"
              '';
            };
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

          # Offline asset-production tools. Approved runtime frames remain
          # source inputs; entering this shell does not regenerate them.
          pi-1_2 = mkPiShell {
            version = "1.2.0";
            testRuntime = self.packages.${system}.pi-test-runtime-1_2;
          };

          pi-1_3 = mkPiShell {
            version = "1.3.0";
            testRuntime = self.packages.${system}.pi-test-runtime-1_3;
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
