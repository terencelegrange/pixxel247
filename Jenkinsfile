pipeline {
    agent any

    environment {
        REMOTE_HOST  = '192.168.100.228'
        REMOTE_USER  = 'terence'
        DEPLOY_DIR   = '/home/pixxel247'
        APP_PORT     = '7247'
        NPM_REGISTRY = 'http://192.168.100.223:4873'
    }

    triggers {
        GenericTrigger(tokenCredentialId: 'PIXXEL247_WEBHOOK_TOKEN')
    }

    stages {
        stage('Checkout') {
            steps { checkout scm }
        }

        stage('Write env file') {
            steps {
                withCredentials([
                    string(credentialsId: 'PIXXEL247_DATABASE_URL', variable: 'PIXXEL247_DATABASE_URL'),
                    string(credentialsId: 'PIXXEL247_JWT_SECRET', variable: 'PIXXEL247_JWT_SECRET'),
                    string(credentialsId: 'PIXXEL247_ADMIN_EMAIL', variable: 'PIXXEL247_ADMIN_EMAIL'),
                    string(credentialsId: 'PIXXEL247_ADMIN_PASSWORD_HASH', variable: 'PIXXEL247_ADMIN_PASSWORD_HASH'),
                    string(credentialsId: 'PIXXEL247_MONITORING_KEY', variable: 'PIXXEL247_MONITORING_KEY')
                ]) {
                    sh '''
                        umask 077
                        cat > pixxel247.env <<EOF
DATABASE_URL=${PIXXEL247_DATABASE_URL}
JWT_SECRET=${PIXXEL247_JWT_SECRET}
ADMIN_EMAIL=${PIXXEL247_ADMIN_EMAIL}
ADMIN_PASSWORD_HASH=${PIXXEL247_ADMIN_PASSWORD_HASH}
MONITORING_ENCRYPTION_KEY=${PIXXEL247_MONITORING_KEY}
PIXXEL247_DATA_DIR=data
EOF
                    '''
                    sshagent(credentials: ['PROXMOX_APPS_KEY']) {
                        sh '''
                            ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${DEPLOY_DIR}"
                            scp pixxel247.env ${REMOTE_USER}@${REMOTE_HOST}:${DEPLOY_DIR}/pixxel247.env
                        '''
                    }
                }
            }
        }

        stage('Transfer Code') {
            steps {
                sshagent(credentials: ['PROXMOX_APPS_KEY']) {
                    sh '''
                        rsync -az --delete \
                            --exclude='.git' \
                            --exclude='node_modules' \
                            --exclude='.next' \
                            --exclude='.env*' \
                            --exclude='pixxel247.env' \
                            ./ ${REMOTE_USER}@${REMOTE_HOST}:${DEPLOY_DIR}/
                    '''
                }
            }
        }

        stage('Build & Deploy') {
            steps {
                sshagent(credentials: ['PROXMOX_APPS_KEY']) {
                    sh '''
                        ssh ${REMOTE_USER}@${REMOTE_HOST} "
                            cd ${DEPLOY_DIR}
                            docker compose up -d --build --remove-orphans
                        "
                    '''
                }
            }
        }

        stage('Health Check') {
            steps {
                sshagent(credentials: ['PROXMOX_APPS_KEY']) {
                    sh '''
                        ssh ${REMOTE_USER}@${REMOTE_HOST} 'bash -s' <<'REMOTE_SCRIPT'
                            attempt=0
                            until curl -sf http://localhost:7247/api/health > /dev/null 2>&1; do
                                attempt=$((attempt+1))
                                if [ "$attempt" -ge 24 ]; then
                                    echo 'Health check timed out after 120s'
                                    docker logs --tail 100 pixxel247 || true
                                    exit 1
                                fi
                                echo "Waiting for app... ($attempt/24)"
                                sleep 5
                            done
                            echo 'App is healthy'
REMOTE_SCRIPT
                    '''
                }
            }
        }
    }

    post {
        always { cleanWs() }
        success { echo "Deployed successfully to ${REMOTE_HOST}:${APP_PORT}" }
        failure { echo 'Deploy failed -- check logs above' }
    }
}
