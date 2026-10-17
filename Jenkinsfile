pipeline {
  // Provision a Linux agent with JDK 21, Maven 3.9+, Node 22.15+, Docker, and Trivy.
  // The Jenkins service account needs access to Docker for Testcontainers.
  agent any
  options { timestamps(); timeout(time: 30, unit: 'MINUTES'); disableConcurrentBuilds() }
  environment { CI = 'true' }
  stages {
    stage('Java verification') {
      steps { sh 'mvn -B -ntp clean verify' }
      post {
        always {
          junit testResults: 'services/*/target/surefire-reports/*.xml', allowEmptyResults: true
          archiveArtifacts artifacts: 'services/*/target/site/jacoco/**', allowEmptyArchive: true
        }
      }
    }
    stage('Console and SDK') {
      steps { sh 'npm ci && npm run typecheck && npm test && npm run build && npm run coverage:java' }
    }
    stage('Browser demo') {
      steps { sh 'npx playwright install --with-deps chromium && npm run test:e2e' }
    }
    stage('Security scanning') {
      steps {
        sh 'mkdir -p artifacts'
        sh 'npm audit --audit-level=high'
        sh 'trivy fs --offline-scan --scanners vuln,secret --severity HIGH,CRITICAL --exit-code 1 --skip-files "**/pom.xml" --skip-dirs node_modules,.git,.tools,apps/console/.next --format json --output artifacts/trivy.json .'
      }
    }
    stage('Build deployable images') {
      steps { sh 'docker compose --profile console build' }
    }
    stage('Scan runtime images') {
      steps {
        sh 'trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json --output artifacts/gateway-security.json identity-demo-gateway'
        sh 'trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json --output artifacts/platform-security.json identity-demo-platform'
        sh 'trivy image --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format json --output artifacts/console-security.json identity-demo-console'
        sh 'npm run security:summary'
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'artifacts/*.json,test-results/**', allowEmptyArchive: true
    }
  }
}
